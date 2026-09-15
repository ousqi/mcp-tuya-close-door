import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"

import type { TuyaDoorService } from "./tuya-door-service.js"

export interface McpDependencies {
  readonly tuya: TuyaDoorService
}

type ToolResult = {
  content: { type: "text"; text: string }[]
  isError?: true
}

export interface McpTools {
  close(input: { readonly confirmation: boolean }): Promise<ToolResult>
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
  }
}

/** Registers the sole safety-sensitive local tool on an MCP server. */
export function register(server: McpServer, handlers: McpTools): void {
  server.registerTool(
    "tuya_close_door",
    {
      description: "Send the configured local close command only after explicit confirmation.",
      inputSchema: { confirmation: z.boolean() },
    },
    ({ confirmation }) => handlers.close({ confirmation }),
  )
}

/** Composes an MCP server from supplied clients, keeping transport startup separate. */
export function mcp(dependencies: McpDependencies): McpServer {
  const server = new McpServer({ name: "mcp-tuya-close-door", version: "0.1.0" })
  register(server, tools(dependencies))
  return server
}
