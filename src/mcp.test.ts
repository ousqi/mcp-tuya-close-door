import assert from "node:assert/strict"
import test from "node:test"

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"

import { register, tools } from "./mcp.js"

test("register exposes the confirmed close-door and fixed-camera snapshot tools", () => {
  // Arrange
  const names: string[] = []
  const server = {
    registerTool: (name: string) => names.push(name),
  } as unknown as McpServer
  const handlers = {
    close: async () => ({ content: [{ type: "text" as const, text: "accepted" }] }),
    snapshot: async () => ({ content: [{ type: "text" as const, text: "snapshot" }] }),
  }

  // Act
  register(server, handlers)

  // Assert
  assert.deepEqual(names, ["tuya_close_door", "frigate_latest_snapshot"])
})

test("close refuses without confirmation and never calls the service", async () => {
  // Arrange
  let closeCalls = 0
  const handlers = tools({
    tuya: {
      close: async () => {
        closeCalls += 1
        return { accepted: true }
      },
    },
    frigate: { snapshot: async () => ({ path: "/snapshot.jpg", capturedAt: "2026-09-16T00:00:00.000Z" }) },
  })

  // Act
  const result = await handlers.close({ confirmation: false })

  // Assert
  assert.deepEqual(result, {
    content: [{ type: "text", text: "Refused: closing the door requires confirmation: true." }],
    isError: true,
  })
  assert.equal(closeCalls, 0)
})

test("close calls the service only after explicit true confirmation", async () => {
  // Arrange
  let closeCalls = 0
  const handlers = tools({
    tuya: {
      close: async () => {
        closeCalls += 1
        return { accepted: true }
      },
    },
    frigate: { snapshot: async () => ({ path: "/snapshot.jpg", capturedAt: "2026-09-16T00:00:00.000Z" }) },
  })

  // Act
  const result = await handlers.close({ confirmation: true })

  // Assert
  assert.deepEqual(result, { content: [{ type: "text", text: "Door close command accepted." }] })
  assert.equal(closeCalls, 1)
})

test("close reports an unavailable command when the service has no complete configuration", async () => {
  // Arrange
  let closeCalls = 0
  const handlers = tools({
    tuya: {
      close: async () => {
        closeCalls += 1
        throw new Error("Configured local Tuya close command is not available.")
      },
    },
    frigate: { snapshot: async () => ({ path: "/snapshot.jpg", capturedAt: "2026-09-16T00:00:00.000Z" }) },
  })

  // Act
  const result = await handlers.close({ confirmation: true })

  // Assert
  assert.deepEqual(result, {
    content: [{ type: "text", text: "Door close command was not accepted." }],
    isError: true,
  })
  assert.equal(closeCalls, 1)
})

test("close failures become non-sensitive MCP tool errors", async () => {
  // Arrange
  const handlers = tools({
    tuya: {
      close: async () => Promise.reject(new Error("device-id=secret")),
    },
    frigate: { snapshot: async () => ({ path: "/snapshot.jpg", capturedAt: "2026-09-16T00:00:00.000Z" }) },
  })

  // Act
  const close = await handlers.close({ confirmation: true })

  // Assert
  assert.deepEqual(close, { content: [{ type: "text", text: "Door close command was not accepted." }], isError: true })
})

test("snapshot returns only its saved path and UTC capture time", async () => {
  // Arrange
  const handlers = tools({
    tuya: { close: async () => ({ accepted: true }) },
    frigate: { snapshot: async () => ({ path: "/snapshots/latest.jpg", capturedAt: "2026-09-16T00:00:00.000Z" }) },
  })

  // Act
  const result = await handlers.snapshot()

  // Assert
  assert.deepEqual(result, {
    content: [{ type: "text", text: '{"path":"/snapshots/latest.jpg","capturedAt":"2026-09-16T00:00:00.000Z"}' }],
  })
})

test("snapshot failures become non-sensitive MCP tool errors", async () => {
  // Arrange
  const handlers = tools({
    tuya: { close: async () => ({ accepted: true }) },
    frigate: { snapshot: async () => Promise.reject(new Error("https://token@frigate.example.test")) },
  })

  // Act
  const result = await handlers.snapshot()

  // Assert
  assert.deepEqual(result, { content: [{ type: "text", text: "Latest Frigate snapshot is unavailable." }], isError: true })
})
