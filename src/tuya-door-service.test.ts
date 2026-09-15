import assert from "node:assert/strict"
import test from "node:test"

import { createTuyaDoorService, type TuyaDevice, type TuyaDeviceFactory } from "./tuya-door-service.js"

const settings = {
  deviceID: "device-id",
  localKey: "local-key",
  host: "192.0.2.10",
  version: 3.4,
  port: 6668,
  closeCommand: { dps: 1, value: false },
} as const

interface MockDevice extends TuyaDevice {
  readonly calls: string[]
  emitError(error: Error): void
}

function mock(overrides: Partial<TuyaDevice> = {}): MockDevice {
  const calls: string[] = []
  let errorListener: ((error: Error) => void) | undefined
  return {
    calls,
    connect: async () => {
      calls.push("connect")
      return true
    },
    disconnect: () => calls.push("disconnect"),
    get: async () => {
      calls.push("get")
      return { dps: { "1": true, "2": false } }
    },
    set: async (options) => {
      calls.push(`set:${options.dps}:${String(options.set)}`)
      return {}
    },
    on: (_event, listener) => {
      errorListener = listener
    },
    emitError: (error) => errorListener?.(error),
    ...overrides,
  }
}

test("close sends only the configured DPS and value after a schema guard", async () => {
  // Arrange
  const client = mock()
  const factory: TuyaDeviceFactory = () => client
  const service = createTuyaDoorService(settings, factory)

  // Act
  const result = await service.close()

  // Assert
  assert.deepEqual(result, { accepted: true })
  assert.deepEqual(client.calls, ["connect", "get", "set:1:false", "disconnect"])
})

test("close refuses without a complete configured command and never connects or sets", async () => {
  // Arrange
  const client = mock()
  const factory: TuyaDeviceFactory = () => client
  const { closeCommand: _closeCommand, ...inspectionOnlySettings } = settings
  const service = createTuyaDoorService(inspectionOnlySettings, factory)

  // Act and assert
  await assert.rejects(service.close(), /Configured local Tuya close command is not available/)
  assert.deepEqual(client.calls, [])
})

test("close denies an unadvertised configured DPS and still disconnects", async () => {
  // Arrange
  const client = mock({ get: async () => ({ dps: { "2": true } }) })
  const factory: TuyaDeviceFactory = () => client
  const service = createTuyaDoorService(settings, factory)

  // Act and assert
  await assert.rejects(service.close(), /Configured local Tuya close command is not available/)
  assert.deepEqual(client.calls, ["connect", "disconnect"])
})

test("emitted operation errors are redacted, fail the close command, and disconnect once", async () => {
  // Arrange
  const client = mock({
    get: async () => {
      client.calls.push("get")
      client.emitError(new Error("192.0.2.10 local-key"))
      return { dps: { "1": true } }
    },
  })
  const factory: TuyaDeviceFactory = () => client
  const service = createTuyaDoorService(settings, factory)

  // Act and assert
  await assert.rejects(service.close(), (error: unknown) => {
    assert.match(String(error), /Local Tuya operation failed/)
    assert.doesNotMatch(String(error), /192\.0\.2\.10|local-key/)
    return true
  })
  assert.deepEqual(client.calls, ["connect", "get", "disconnect"])
})
