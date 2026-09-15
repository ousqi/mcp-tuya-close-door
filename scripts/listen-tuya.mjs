import fs from "node:fs"

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
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"(.*)"$/, "$1")]
      })
      .filter((entry) => entry !== undefined),
  )
}

function dps(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
  if (typeof value.dps !== "object" || value.dps === null || Array.isArray(value.dps)) return undefined
  return value.dps
}

const env = environment(".env")
const device = new TuyAPI({
  id: env.TUYA_DEVICE_ID,
  key: env.TUYA_LOCAL_KEY,
  ip: env.TUYA_HOST,
  port: Number(env.TUYA_PORT),
  version: 3.4,
  issueGetOnConnect: false,
  issueRefreshOnConnect: false,
  issueRefreshOnPing: false,
})

function record(value) {
  const changed = dps(value)
  if (!changed) return
  console.log(JSON.stringify({ at: new Date().toISOString(), dps: changed }))
}

device.on("data", record)
device.on("dp-refresh", record)
device.on("error", () => console.error("Local Tuya listener connection error."))

try {
  await device.connect()
  console.log("READY")
  await new Promise((resolve) => setTimeout(resolve, 120_000))
} finally {
  device.disconnect()
}
