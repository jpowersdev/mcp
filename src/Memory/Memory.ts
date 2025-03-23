import { Effect, Schema } from "effect"
import type { Node, Relation } from "./Domain/KnowledgeBase.js"
import { MemoryError, NodeFromResult, RelationFromResult, Result } from "./Domain/Memory.js"
import { Neo4jDriver } from "./Neo4jGraph.js"

export class Memory extends Effect.Service<Memory>()("Memory", {
  scoped: Effect.gen(function*(_) {
    const driver = yield* Neo4jDriver

    const session = driver.session({
      database: "neo4j"
    })

    const decodeNode = Schema.decodeUnknown(NodeFromResult)
    const decodeRelation = Schema.decodeUnknown(RelationFromResult)
    const decodeResult = Schema.decodeUnknown(Result(Schema.Any))

    // Node operations
    const createNode = Effect.fn("createNode")(
      (node: Node) =>
        Effect.tryPromise({
          try: () =>
            session.executeWrite((tx) =>
              tx.run(
                "CREATE (n:$labels) SET n = $props RETURN n",
                {
                  labels: [node._tag],
                  props: {
                    ...node,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                  }
                }
              )
            ),
          catch: (cause) => new MemoryError({ message: `Failed to create node`, cause })
        }).pipe(Effect.flatMap(decodeNode))
    )

    const findNode = Effect.fn("findNode")(
      (id: string) =>
        Effect.tryPromise({
          try: () =>
            session.executeRead((tx) =>
              tx.run(
                "MATCH (n) WHERE n.id = $id RETURN n",
                { id }
              )
            ),
          catch: (cause) => new MemoryError({ message: `Failed to find node`, cause })
        }).pipe(Effect.flatMap(decodeNode))
    )

    // Relationship operations
    const createRelationship = Effect.fn("createRelationship")(
      (rel: Relation) =>
        Effect.tryPromise({
          try: () =>
            session.executeWrite((tx) =>
              tx.run(
                `
                MATCH (from) WHERE from.id = $fromId
                MATCH (to) WHERE to.id = $toId
                CREATE (from)-[r:$type $props]->(to)
                RETURN r
                `,
                {
                  fromId: rel.fromId,
                  toId: rel.toId,
                  type: rel.type,
                  props: {
                    ...rel,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                  }
                }
              )
            ),
          catch: (cause) => new MemoryError({ message: `Failed to create relationship`, cause })
        }).pipe(Effect.flatMap(decodeRelation))
    )

    const findRelationships = Effect.fn("findRelationships")(
      (nodeId: string, direction: "incoming" | "outgoing" | "both" = "both") =>
        Effect.tryPromise({
          try: () => {
            const query = direction === "both"
              ? "MATCH (n)-[r]-(other) WHERE n.id = $nodeId RETURN r"
              : direction === "outgoing"
              ? "MATCH (n)-[r]->(other) WHERE n.id = $nodeId RETURN r"
              : "MATCH (n)<-[r]-(other) WHERE n.id = $nodeId RETURN r"

            return session.executeRead((tx) => tx.run(query, { nodeId }))
          },
          catch: (cause) => new MemoryError({ message: `Failed to find relationships`, cause })
        }).pipe(Effect.flatMap(decodeRelation))
    )

    // Graph queries
    const query = Effect.fn("query")(
      (cypher: string, params?: Record<string, unknown>) =>
        Effect.tryPromise({
          try: () => session.executeRead((tx) => tx.run(cypher, params)),
          catch: (cause) => new MemoryError({ message: `Query failed`, cause })
        }).pipe(
          Effect.flatMap(decodeResult)
        )
    )

    return {
      createNode,
      findNode,
      createRelationship,
      findRelationships,
      query
    } as const
  })
}) {}
