import { isAbsolute, resolve } from "node:path"

export interface Config {
  readonly tuya: {
    readonly deviceID: string
    readonly localKey: string
    readonly host: string
    readonly version: number
    readonly port: number
    readonly closeCommand?: {
      readonly dps: number
      readonly value: string | number | boolean
    }
  }
  readonly frigate: {
    readonly baseUrl: string
    readonly cameraName: string
    readonly token: string
    readonly snapshotDirectory: string
  }
}

export class ConfigurationError extends Error {
  readonly variables: readonly string[]

  constructor(variables: readonly string[]) {
    super(`Invalid environment configuration: ${variables.join(", ")}`)
    this.name = "ConfigurationError"
    this.variables = variables
  }
}

const REQUIRED = [
  "TUYA_DEVICE_ID",
  "TUYA_LOCAL_KEY",
  "TUYA_HOST",
  "TUYA_VERSION",
  "TUYA_PORT",
] as const

const FRIGATE_REQUIRED = [
  "FRIGATE_BASE_URL",
  "FRIGATE_CAMERA_NAME",
  "FRIGATE_TOKEN",
  "FRIGATE_SNAPSHOT_DIRECTORY",
] as const

function value(environment: NodeJS.ProcessEnv, name: string): string | undefined {
  const candidate = environment[name]?.trim()
  return candidate ? candidate : undefined
}

function number(input: string | undefined, predicate: (candidate: number) => boolean): number | undefined {
  if (!input) return undefined

  const candidate = Number(input)
  return Number.isFinite(candidate) && predicate(candidate) ? candidate : undefined
}

function host(input: string | undefined): string | undefined {
  if (!input || /[\s/@]/.test(input)) return undefined

  try {
    const parsed = new URL(`http://${input}`)
    if (parsed.host !== input || parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      return undefined
    }
    return input
  } catch {
    return undefined
  }
}

function frigateUrl(input: string | undefined): string | undefined {
  if (!input) return undefined

  try {
    const parsed = new URL(input)
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      return undefined
    }
    return parsed.toString()
  } catch {
    return undefined
  }
}

function camera(input: string | undefined): string | undefined {
  return input && /^[A-Za-z0-9_-]+$/.test(input) ? input : undefined
}

function directory(input: string | undefined): string | undefined {
  return input && isAbsolute(input) ? resolve(input) : undefined
}

function json(input: string | undefined): unknown | undefined {
  if (!input) return undefined

  try {
    return JSON.parse(input) as unknown
  } catch {
    return undefined
  }
}

function command(input: unknown): input is string | number | boolean {
  return typeof input === "string" || typeof input === "number" || typeof input === "boolean"
}

/** Validates configuration at the process boundary without ever including secret values in errors. */
export function config(environment: NodeJS.ProcessEnv = process.env): Config {
  const values = Object.fromEntries(REQUIRED.map((name) => [name, value(environment, name)])) as Record<
    (typeof REQUIRED)[number],
    string | undefined
  >
  const tuyaHost = host(values.TUYA_HOST)
  const tuyaVersion = number(values.TUYA_VERSION, (candidate) => candidate === 3.4)
  const tuyaPort = number(
    values.TUYA_PORT,
    (candidate) => Number.isInteger(candidate) && candidate >= 1 && candidate <= 65_535,
  )
  const closeDps = number(value(environment, "TUYA_CLOSE_DPS"), (candidate) => Number.isInteger(candidate) && candidate >= 1)
  const closeValue = json(value(environment, "TUYA_CLOSE_VALUE"))
  const frigateValues = Object.fromEntries(FRIGATE_REQUIRED.map((name) => [name, value(environment, name)])) as Record<
    (typeof FRIGATE_REQUIRED)[number],
    string | undefined
  >
  const frigateBaseUrl = frigateUrl(frigateValues.FRIGATE_BASE_URL)
  const frigateCamera = camera(frigateValues.FRIGATE_CAMERA_NAME)
  const snapshotDirectory = directory(frigateValues.FRIGATE_SNAPSHOT_DIRECTORY)
  const invalid = [
    ...REQUIRED.filter((name) => !values[name]),
    ...(tuyaHost ? [] : ["TUYA_HOST"]),
    ...(tuyaVersion === undefined ? ["TUYA_VERSION"] : []),
    ...(tuyaPort === undefined ? ["TUYA_PORT"] : []),
    ...FRIGATE_REQUIRED.filter((name) => !frigateValues[name]),
    ...(frigateBaseUrl ? [] : ["FRIGATE_BASE_URL"]),
    ...(frigateCamera ? [] : ["FRIGATE_CAMERA_NAME"]),
    ...(snapshotDirectory ? [] : ["FRIGATE_SNAPSHOT_DIRECTORY"]),
  ].filter((name, index, all) => all.indexOf(name) === index)

  if (invalid.length > 0) throw new ConfigurationError(invalid)
  if (!tuyaHost || tuyaVersion === undefined || tuyaPort === undefined || !frigateBaseUrl || !frigateCamera || !snapshotDirectory) {
    throw new ConfigurationError([])
  }

  const configured = values as Record<(typeof REQUIRED)[number], string>

  return {
    tuya: {
      deviceID: configured.TUYA_DEVICE_ID,
      localKey: configured.TUYA_LOCAL_KEY,
      host: tuyaHost,
      version: tuyaVersion,
      port: tuyaPort,
      ...(closeDps !== undefined && command(closeValue) ? { closeCommand: { dps: closeDps, value: closeValue } } : {}),
    },
    frigate: {
      baseUrl: frigateBaseUrl,
      cameraName: frigateCamera,
      token: frigateValues.FRIGATE_TOKEN as string,
      snapshotDirectory,
    },
  }
}
