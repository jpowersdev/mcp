import { Config, Effect } from "effect"
import * as neo4j from "neo4j-driver"

// Neo4j configuration tag
export const Neo4jConfig = Config.all({
  url: Config.string("NEO4J_URL"),
  username: Config.string("NEO4J_USERNAME"),
  password: Config.string("NEO4J_PASSWORD")
})

export class Neo4jDriver extends Effect.Service<Neo4jDriver>()("Neo4jDriver", {
  scoped: Effect.gen(function*(_) {
    const config = yield* Neo4jConfig
    const driver = yield* Effect.acquireRelease(
      Effect.sync(() =>
        neo4j.driver(
          config.url,
          neo4j.auth.basic(config.username, config.password)
        )
      ),
      (driver) => Effect.promise(() => driver.close())
    )

    yield* Effect.tryPromise(() => driver.getServerInfo()).pipe(
      Effect.tap(Effect.logDebug)
    )

    return driver
  })
}) {}
