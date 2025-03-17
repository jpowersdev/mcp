import * as Command from "@effect/cli/Command"
import { MemoryServer } from "./MemoryServer.js"

const command = Command.make("mcp").pipe(
  Command.withSubcommands([
    Command.make("memory-server", {}, () => MemoryServer.run).pipe(
      Command.provide(MemoryServer.Default)
    )
  ])
)

export const run = Command.run(command, {
  name: "MCP",
  // set this to the current timestamp when you save
  version: "2025-03-17T12:00:00.000Z"
})
