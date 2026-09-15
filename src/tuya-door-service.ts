import TuyAPI from "tuyapi"

import type { Config } from "./config.js"

export interface TuyaDevice {
  connect(): Promise<boolean>
  disconnect(): void
  get(options: { readonly schema: true }): Promise<unknown>
  set(options: { readonly dps: number; readonly set: string | number | boolean }): Promise<unknown>
  on(event: "error", listener: (error: Error) => void): unknown
}

export interface TuyaDoorService {
  close(): Promise<{ readonly accepted: true }>
}

export type TuyaDeviceFactory = (options: {
  readonly id: string
  readonly key: string
  readonly ip: string
  readonly port: number
  readonly version: number
  readonly issueGetOnConnect: false
}) => TuyaDevice

export class TuyaDoorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TuyaDoorError"
  }
}

function device(options: Parameters<TuyaDeviceFactory>[0]): TuyaDevice {
  return new TuyAPI(options)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function schema(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value) || !isRecord(value.dps)) throw new TuyaDoorError("Local Tuya status is unavailable.")
  return { ...value.dps }
}

function command(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
}

async function session<T>(
  factory: TuyaDeviceFactory,
  settings: Config["tuya"],
  operation: (client: TuyaDevice, assertHealthy: () => void) => Promise<T>,
): Promise<T> {
  const client = factory({
    id: settings.deviceID,
    key: settings.localKey,
    ip: settings.host,
    port: settings.port,
    version: settings.version,
    issueGetOnConnect: false,
  })
  let disconnected = false
  let emittedError = false

  const disconnect = (): void => {
    if (disconnected) return
    disconnected = true

    try {
      client.disconnect()
    } catch {
      // Disconnect errors cannot make an operation disclose connection details.
    }
  }

  const assertHealthy = (): void => {
    if (emittedError) throw new TuyaDoorError("Local Tuya operation failed.")
  }

  try {
    // EventEmitter treats an unhandled "error" event as a process-level exception.
    client.on("error", () => {
      emittedError = true
      disconnect()
    })

    if (!(await client.connect())) throw new TuyaDoorError("Local Tuya device is unavailable.")
    assertHealthy()

    const result = await operation(client, assertHealthy)
    assertHealthy()
    return result
  } catch (error: unknown) {
    if (error instanceof TuyaDoorError) throw error
    throw new TuyaDoorError("Local Tuya operation failed.")
  } finally {
    disconnect()
  }
}

/** Creates a local-only Tuya client; commands are allowed only by complete fixed environment configuration. */
export function createTuyaDoorService(
  settings: Config["tuya"],
  factory: TuyaDeviceFactory = device,
): TuyaDoorService {
  const close = async (): Promise<{ readonly accepted: true }> => {
    const closeCommand = settings.closeCommand
    if (!closeCommand) throw new TuyaDoorError("Configured local Tuya close command is not available.")

    return session(factory, settings, async (client, assertHealthy) => {
      const dps = schema(await client.get({ schema: true }))
      if (!Object.hasOwn(dps, String(closeCommand.dps)) || !command(closeCommand.value)) {
        throw new TuyaDoorError("Configured local Tuya close command is not available.")
      }

      assertHealthy()
      await client.set({ dps: closeCommand.dps, set: closeCommand.value })
      return { accepted: true }
    })
  }

  return { close }
}
