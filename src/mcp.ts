import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { TuyaDoorService } from "./tuya-door-service.js"
import type { FrigateClient } from "./frigate-client.js"

export interface McpDependencies {
  readonly tuya: TuyaDoorService
  readonly frigate: FrigateClient
}

type ToolResult = {
  content: { type: "text"; text: string }[]
  isError?: true
}

export interface McpTools {
  close(input: { readonly confirmation: boolean }): Promise<ToolResult>
  snapshot(): Promise<ToolResult>
}

function failure(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true }
}

/** Creates tool handlers with explicit clients so they can be tested without device connections. */
export function tools(dependencies: McpDependencies): McpTools {
  return {
    async close(input: { readonly confirmation: boolean }): Promise<ToolResult> {
      if (input.confirmation !== true) {
        return failure("Refused: closing the door requires confirmation: true.")
      }

      return dependencies.tuya.close().then((): ToolResult => ({
        content: [{ type: "text", text: "Door close command accepted." }],
      })).catch(() => failure("Door close command was not accepted."))
    },
    async snapshot(): Promise<ToolResult> {
      return dependencies.frigate.snapshot().then((result): ToolResult => ({
        content: [{ type: "text", text: JSON.stringify({ path: result.path, capturedAt: result.capturedAt }) }],
      })).catch(() => failure("Latest Frigate snapshot is unavailable."))
    },
  }
}

/** Registers local Tuya close control and the fixed-camera read-only snapshot tool. */
export function register(server: McpServer, handlers: McpTools): void {
  server.registerTool(
    "tuya_close_door",
    {
      description: "Send the configured local close command only after explicit confirmation.",
      inputSchema: { confirmation: z.boolean() },
    },
    ({ confirmation }) => handlers.close({ confirmation }),
  )
  server.registerTool(
    "frigate_latest_snapshot",
    {
      description: "Save the latest JPEG from the configured Frigate camera and return its local path and capture time.",
      inputSchema: {},
    },
    () => handlers.snapshot(),
  )
}

/** Composes an MCP server from supplied clients, keeping transport startup separate. */
export function mcp(dependencies: McpDependencies): McpServer {
  const server = new McpServer({ name: "mcp-tuya-close-door", version: "0.1.0" })
  register(server, tools(dependencies))
  return server
}
