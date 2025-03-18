import * as Command from "@effect/cli/Command"
import { FetchServer } from "./FetchServer.js"
import { MemoryServer } from "./MemoryServer.js"

const command = Command.make("mcp").pipe(
  Command.withSubcommands([
    Command.make("memory", {}, () => MemoryServer.run).pipe(
      Command.provide(MemoryServer.Default)
    ),
    Command.make("fetch", {}, () => FetchServer.run).pipe(
      Command.provide(FetchServer.Default)
    )
  ])
)

export const run = Command.run(command, {
  name: "MCP",
  version: "1.0.0"
})
