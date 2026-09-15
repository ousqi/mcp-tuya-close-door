import fs from "node:fs"
import net from "node:net"

import TuyAPI from "tuyapi"

function environment(file) {
  return Object.fromEntries(
    fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=")
        if (index < 1) return undefined

        const key = line.slice(0, index).trim()
        const raw = line.slice(index + 1).trim()
        const value = raw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1")
        return [key, value]
      })
      .filter((entry) => entry !== undefined),
  )
}

function settings(env) {
  const keys = ["TUYA_DEVICE_ID", "TUYA_LOCAL_KEY", "TUYA_HOST", "TUYA_VERSION", "TUYA_PORT"]
  const missing = keys.filter((key) => !env[key])
  if (missing.length > 0) throw new Error(`Missing settings: ${missing.join(", ")}`)

  return {
    id: env.TUYA_DEVICE_ID,
    key: env.TUYA_LOCAL_KEY,
    ip: env.TUYA_HOST,
    version: Number(env.TUYA_VERSION),
    port: Number(env.TUYA_PORT),
    issueGetOnConnect: false,
    issueRefreshOnConnect: false,
    issueRefreshOnPing: false,
  }
}

const env = environment(".env")
const options = settings(env)

function within(promise, milliseconds, message) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function probe(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port })
    socket.once("connect", () => {
      socket.end()
      resolve()
    })
    socket.once("error", () => reject(new Error("The configured Tuya TCP port is unreachable")))
    socket.setTimeout(5_000, () => socket.destroy(new Error("The configured Tuya TCP port timed out")))
  })
}

await probe(options.ip, options.port)
const versions = Array.from(new Set([options.version, 3.1, 3.2, 3.3, 3.4, 3.5]))
const failures = []

for (const version of versions) {
  const device = new TuyAPI({ ...options, version })

  try {
    await within(device.connect(), 6_000, "connect timeout")
    const result = await within(device.get({ schema: true }), 6_000, "read timeout")
    const dps = result?.dps ?? result
    console.log(JSON.stringify({ protocolVersion: version, dps }, null, 2))
    process.exitCode = 0
    break
  } catch {
    failures.push(version)
  } finally {
    device.disconnect()
  }
}

if (process.exitCode !== 0) {
  throw new Error(`No readable Tuya local protocol response for versions: ${failures.join(", ")}`)
}
