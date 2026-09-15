#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { config as dotenv } from "dotenv"

import { config } from "./config.js"
import { mcp } from "./mcp.js"
import { createTuyaDoorService } from "./tuya-door-service.js"

async function main(): Promise<void> {
  dotenv({ quiet: true })
  const settings = config()
  const server = mcp({
    tuya: createTuyaDoorService(settings.tuya),
  })
  const transport = new StdioServerTransport()

  await server.connect(transport)
}

void main().catch(() => {
  console.error("Failed to start MCP server.")
  process.exitCode = 1
})
