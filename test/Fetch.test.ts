import * as it from "@effect/vitest"
import { FetchServer } from "@jpowersdev/mcp/FetchServer"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { Effect } from "effect"

it.describe("Fetch", () => {
  const client = new Client({
    name: "test",
    version: "1.0.0"
  })

  it.effect("should fetch data from the API", () =>
    Effect.gen(function*() {
      yield* Effect.log("Connecting to client")

      const program = Effect.gen(function*() {
        const fetchServer = yield* FetchServer

        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
        client.connect(clientTransport)
        fetchServer.server.connect(serverTransport)

        const { tools } = yield* Effect.promise(() => client.listTools())
        it.expect(tools).toContainEqual(it.expect.objectContaining({ name: "fetch" }))

        const result = yield* Effect.promise(() =>
          client.callTool({
            name: "fetch",
            args: { url: "https://jsonplaceholder.typicode.com/todos/1" }
          })
        )
        it.expect(result.isError).toBeUndefined()
        it.expect(result).toEqual(
          it.expect.objectContaining({
            content: [{
              type: "text",
              text: it.expect.stringContaining("")
            }]
          })
        )
      })

      return yield* program.pipe(
        Effect.provide(FetchServer.Default)
      )
    }))
})
