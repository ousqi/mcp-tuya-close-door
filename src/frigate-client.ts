import { mkdir, writeFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { join, resolve } from "node:path"

import type { Config } from "./config.js"

const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024

export interface FrigateSnapshot {
  readonly path: string
  readonly capturedAt: string
}

export interface FrigateClient {
  snapshot(): Promise<FrigateSnapshot>
}

export interface FrigateResponse {
  readonly ok: boolean
  readonly headers: { get(name: string): string | null }
  readonly body: ReadableStream<Uint8Array> | null
}

export interface FrigateDependencies {
  readonly fetch: (input: string, init: { readonly headers: { readonly Authorization: string } }) => Promise<FrigateResponse>
  readonly mkdir: (path: string, options: { readonly recursive: true }) => Promise<string | undefined>
  readonly writeFile: (path: string, data: Uint8Array, options: { readonly flag: "wx" }) => Promise<void>
  readonly uuid: () => string
  readonly now: () => Date
}

export class FrigateSnapshotError extends Error {
  constructor() {
    super("Latest Frigate snapshot is unavailable.")
    this.name = "FrigateSnapshotError"
  }
}

function dependencies(): FrigateDependencies {
  return { fetch, mkdir, writeFile, uuid: randomUUID, now: () => new Date() }
}

function endpoint(settings: Config["frigate"]): string {
  return new URL(`/api/${settings.cameraName}/latest.jpg`, settings.baseUrl).toString()
}

function jpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9
}

async function body(response: FrigateResponse): Promise<Uint8Array> {
  const length = response.headers.get("content-length")
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_SNAPSHOT_BYTES)) throw new FrigateSnapshotError()
  if (!response.body) throw new FrigateSnapshotError()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > MAX_SNAPSHOT_BYTES) {
        await reader.cancel()
        throw new FrigateSnapshotError()
      }
      chunks.push(next.value)
    }
  } finally {
    reader.releaseLock()
  }

  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

/** Creates a fixed-camera, read-only Frigate snapshot client. */
export function createFrigateClient(
  settings: Config["frigate"],
  injected: FrigateDependencies = dependencies(),
): FrigateClient {
  const snapshot = async (): Promise<FrigateSnapshot> => {
    try {
      const response = await injected.fetch(endpoint(settings), { headers: { Authorization: `Bearer ${settings.token}` } })
      if (!response.ok) throw new FrigateSnapshotError()
      const image = await body(response)
      if (!jpeg(image)) throw new FrigateSnapshotError()

      await injected.mkdir(settings.snapshotDirectory, { recursive: true })
      const capturedAt = injected.now().toISOString()
      const path = resolve(join(settings.snapshotDirectory, `frigate-${capturedAt.replaceAll(/[:.]/g, "-")}-${injected.uuid()}.jpg`))
      await injected.writeFile(path, image, { flag: "wx" })
      return { path, capturedAt }
    } catch {
      throw new FrigateSnapshotError()
    }
  }

  return { snapshot }
}
