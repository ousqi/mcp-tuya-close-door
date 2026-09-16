import assert from "node:assert/strict"
import test from "node:test"

import { createFrigateClient, FrigateSnapshotError, type FrigateDependencies, type FrigateResponse } from "./frigate-client.js"

const settings = {
  baseUrl: "https://frigate.example.test:8971/",
  cameraName: "garage_door",
  token: "frigate-token",
  snapshotDirectory: "/var/lib/mcp-frigate-snapshots",
} as const

function response(bytes: Uint8Array, options: { readonly ok?: boolean; readonly length?: string | null } = {}): FrigateResponse {
  return {
    ok: options.ok ?? true,
    headers: { get: (name) => name === "content-length" ? (options.length ?? String(bytes.byteLength)) : null },
    body: new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.enqueue(bytes)
        controller.close()
      },
    }),
  }
}

function mock(overrides: Partial<FrigateDependencies> = {}): FrigateDependencies & { readonly calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    fetch: async (url, init) => {
      calls.push(`fetch:${url}:${init.headers.Authorization}`)
      return response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))
    },
    mkdir: async (path) => {
      calls.push(`mkdir:${path}`)
      return undefined
    },
    writeFile: async (path, data, options) => { calls.push(`write:${path}:${data.byteLength}:${options.flag}`) },
    uuid: () => "snapshot-id",
    now: () => new Date("2026-09-16T01:02:03.004Z"),
    ...overrides,
  }
}

test("snapshot GETs only the configured camera and writes a validated JPEG without overwrite", async () => {
  // Arrange
  const dependencies = mock()
  const client = createFrigateClient(settings, dependencies)

  // Act
  const result = await client.snapshot()

  // Assert
  assert.deepEqual(result, {
    path: "/var/lib/mcp-frigate-snapshots/frigate-2026-09-16T01-02-03-004Z-snapshot-id.jpg",
    capturedAt: "2026-09-16T01:02:03.004Z",
  })
  assert.deepEqual(dependencies.calls, [
    "fetch:https://frigate.example.test:8971/api/garage_door/latest.jpg:Bearer frigate-token",
    "mkdir:/var/lib/mcp-frigate-snapshots",
    "write:/var/lib/mcp-frigate-snapshots/frigate-2026-09-16T01-02-03-004Z-snapshot-id.jpg:4:wx",
  ])
})

test("snapshot rejects non-JPEG and HTTP failures without exposing Frigate details", async () => {
  for (const fetch of [
    async () => response(new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
    async () => response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { ok: false }),
  ]) {
    // Arrange
    const dependencies = mock({ fetch })
    const client = createFrigateClient(settings, dependencies)

    // Act and assert
    await assert.rejects(client.snapshot(), (error: unknown) => {
      assert.ok(error instanceof FrigateSnapshotError)
      assert.doesNotMatch(error.message, /frigate\.example|frigate-token/)
      return true
    })
    assert.equal(dependencies.calls.some((call) => call.startsWith("write:")), false)
  }
})

test("snapshot rejects responses exceeding the configured size limit before writing", async () => {
  // Arrange
  const dependencies = mock({ fetch: async () => response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { length: "10485761" }) })
  const client = createFrigateClient(settings, dependencies)

  // Act and assert
  await assert.rejects(client.snapshot(), FrigateSnapshotError)
  assert.equal(dependencies.calls.some((call) => call.startsWith("mkdir:") || call.startsWith("write:")), false)
})
