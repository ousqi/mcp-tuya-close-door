import assert from "node:assert/strict"
import test from "node:test"

import { config, ConfigurationError } from "./config.js"

const environment: NodeJS.ProcessEnv = {
  TUYA_DEVICE_ID: "tuya-device-id",
  TUYA_LOCAL_KEY: "tuya-local-key",
  TUYA_HOST: "192.0.2.10",
  TUYA_VERSION: "3.4",
  TUYA_PORT: "6668",
  TUYA_CLOSE_DPS: "1",
  TUYA_CLOSE_VALUE: '"close"',
  FRIGATE_BASE_URL: "https://frigate.example.test:8971",
  FRIGATE_CAMERA_NAME: "garage_door",
  FRIGATE_TOKEN: "frigate-token",
  FRIGATE_SNAPSHOT_DIRECTORY: "/var/lib/mcp-frigate-snapshots",
}

test("returns validated Tuya configuration", () => {
  const result = config(environment)

  assert.equal(result.tuya.host, "192.0.2.10")
  assert.equal(result.tuya.version, 3.4)
  assert.equal(result.tuya.port, 6668)
  assert.deepEqual(result.tuya.closeCommand, { dps: 1, value: "close" })
  assert.deepEqual(result.frigate, {
    baseUrl: "https://frigate.example.test:8971/",
    cameraName: "garage_door",
    token: "frigate-token",
    snapshotDirectory: "/var/lib/mcp-frigate-snapshots",
  })
})

test("permits omitted close-command configuration while retaining Tuya connectivity", () => {
  const { TUYA_CLOSE_DPS: _dps, TUYA_CLOSE_VALUE: _value, ...withoutCloseCommand } = environment

  const result = config(withoutCloseCommand)

  assert.equal(result.tuya.closeCommand, undefined)
})

test("disables close control for incomplete or malformed close-command configuration", () => {
  const cases: readonly NodeJS.ProcessEnv[] = [
    (() => {
      const { TUYA_CLOSE_DPS: _dps, ...withoutDps } = environment
      return withoutDps
    })(),
    (() => {
      const { TUYA_CLOSE_VALUE: _value, ...withoutValue } = environment
      return withoutValue
    })(),
    { ...environment, TUYA_CLOSE_VALUE: "not-json-secret" },
  ]

  for (const candidate of cases) {
    assert.equal(config(candidate).tuya.closeCommand, undefined)
  }
})

test("rejects invalid local Tuya network settings without leaking secrets", () => {
  const invalid = {
    ...environment,
    TUYA_HOST: "https://local-key@example.test",
    TUYA_LOCAL_KEY: "local-key-secret",
    TUYA_PORT: "0",
    TUYA_VERSION: "4",
  }

  assert.throws(() => config(invalid), (error: unknown) => {
    assert.ok(error instanceof ConfigurationError)
    assert.deepEqual(error.variables, ["TUYA_HOST", "TUYA_VERSION", "TUYA_PORT"])
    assert.doesNotMatch(error.message, /local-key/)
    return true
  })
})

test("rejects Tuya protocol versions other than the verified 3.4", () => {
  const invalid = { ...environment, TUYA_VERSION: "3.3" }

  assert.throws(() => config(invalid), (error: unknown) => {
    assert.ok(error instanceof ConfigurationError)
    assert.deepEqual(error.variables, ["TUYA_VERSION"])
    return true
  })
})

test("rejects unsafe Frigate configuration without disclosing its token", () => {
  const invalid = {
    ...environment,
    FRIGATE_BASE_URL: "http://user:password@frigate.example.test",
    FRIGATE_CAMERA_NAME: "garage/../../other",
    FRIGATE_TOKEN: "frigate-token-secret",
    FRIGATE_SNAPSHOT_DIRECTORY: "relative/snapshots",
  }

  assert.throws(() => config(invalid), (error: unknown) => {
    assert.ok(error instanceof ConfigurationError)
    assert.deepEqual(error.variables, ["FRIGATE_BASE_URL", "FRIGATE_CAMERA_NAME", "FRIGATE_SNAPSHOT_DIRECTORY"])
    assert.doesNotMatch(error.message, /password|frigate-token-secret/)
    return true
  })
})

test("rejects a Frigate URL with a path so requests remain fixed to /api", () => {
  const invalid = { ...environment, FRIGATE_BASE_URL: "https://frigate.example.test/other" }

  assert.throws(() => config(invalid), (error: unknown) => {
    assert.ok(error instanceof ConfigurationError)
    assert.deepEqual(error.variables, ["FRIGATE_BASE_URL"])
    return true
  })
})

test("permits an unauthenticated HTTP Frigate origin on a trusted LAN", () => {
  const result = config({ ...environment, FRIGATE_BASE_URL: "http://192.0.2.253" })

  assert.equal(result.frigate.baseUrl, "http://192.0.2.253/")
})
