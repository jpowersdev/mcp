import type { Schema } from "effect"
import { Context, Effect, Layer, Option } from "effect"
import type { Driver, EagerResult, Transaction } from "neo4j-driver"
import neo4j from "neo4j-driver"
import { getIdentifier, type NodeSchema } from "./KnowledgeBase.js"

// Domain types
export interface Node<T = unknown> {
  id: string
  labels: Array<string>
  properties: T
}

export interface Relationship {
  id: string
  type: string
  properties: Record<string, unknown>
  startNodeId: string
  endNodeId: string
}

// Type transformers
const fromNeo4jNode = <T>(record: EagerResult<any>): Node<T> => {
  const node = record.records[0]?.get("n")
  if (!node) throw new Error("Node not found")

  return {
    id: node.properties.id,
    labels: node.labels,
    properties: node.properties as T
  }
}

const fromNeo4jRelationship = (record: EagerResult<any>): Relationship => {
  const rel = record.records[0]?.get("r")
  if (!rel) throw new Error("Relationship not found")

  return {
    id: rel.properties.id,
    type: rel.type,
    properties: rel.properties,
    startNodeId: rel.startNodeId,
    endNodeId: rel.endNodeId
  }
}

const fromNeo4jNodes = <T>(record: EagerResult<any>): Array<Node<T>> => {
  return record.records.map((r) => {
    const node = r.get("n")
    return {
      id: node.properties.id,
      labels: node.labels,
      properties: node.properties as T
    }
  })
}

const fromNeo4jRelationships = (record: EagerResult<any>): Array<Relationship> => {
  return record.records.map((r) => {
    const rel = r.get("r")
    return {
      id: rel.properties.id,
      type: rel.type,
      properties: rel.properties,
      startNodeId: rel.startNodeId,
      endNodeId: rel.endNodeId
    }
  })
}

// Neo4j driver tag
export class Neo4jDriver extends Context.Tag("Neo4jDriver")<Neo4jDriver, Driver>() {
  static readonly symbol = Symbol()
}

// Neo4j configuration tag
export class Neo4jConfig extends Context.Tag("Neo4jConfig")<
  Neo4jConfig,
  {
    url: string
    username: string
    password: string
  }
>() {
  static readonly symbol = Symbol()
}

// Core graph operations interface
export interface GraphService {
  readonly _tag: "GraphService"

  // Node operations
  createNode: <T extends NodeSchema>(
    schema: T,
    properties: T["members"]
  ) => Effect.Effect<Node<Schema.Schema.Type<T>>, Error>
  updateNode: <T extends NodeSchema>(
    id: string,
    properties: Partial<T["members"]>
  ) => Effect.Effect<Node<Schema.Schema.Type<T>>, Error>
  findNode: <T extends NodeSchema>(id: string) => Effect.Effect<Option.Option<Node<Schema.Schema.Type<T>>>, Error>
  deleteNode: (id: string) => Effect.Effect<void, Error>

  // Relationship operations
  createRelationship: (
    from: string,
    to: string,
    type: string,
    properties?: Record<string, unknown>
  ) => Effect.Effect<Relationship, Error>
  findRelationships: (
    nodeId: string,
    direction: "incoming" | "outgoing" | "both"
  ) => Effect.Effect<Array<Relationship>, Error>

  // Graph queries
  query: <T>(cypher: string, params?: Record<string, unknown>) => Effect.Effect<T, Error>

  // Semantic operations
  findSimilar: (nodeId: string, limit?: number) => Effect.Effect<Array<Node>, Error>
  search: (query: string, schemas?: Array<NodeSchema>) => Effect.Effect<Array<Node>, Error>

  // Transaction management
  transaction: <T>(fn: (tx: Transaction) => Effect.Effect<T, Error>) => Effect.Effect<T, Error>
}

// GraphService tag
export class Graph extends Context.Tag("Graph")<Graph, GraphService>() {
  static readonly symbol = Symbol()
}

// Neo4j driver layer
export const Neo4jDriverLive = Layer.effect(
  Neo4jDriver,
  Effect.gen(function*(_) {
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

    // Test connection
    yield* Effect.tryPromise(() => driver.getServerInfo())

    return driver
  })
)

// GraphService implementation
export const GraphLive = Layer.effect(
  Graph,
  Effect.gen(function*(_) {
    const driver = yield* Neo4jDriver

    const service: GraphService = {
      _tag: "GraphService",

      createNode: <T extends NodeSchema>(schema: T, properties: T["members"]) =>
        Effect.tryPromise(() =>
          driver.executeQuery(
            "CREATE (n:$labels) SET n = $props RETURN n",
            {
              labels: [getIdentifier(schema)],
              props: { ...properties, id: crypto.randomUUID() }
            }
          )
        ).pipe(
          Effect.map((result) => fromNeo4jNode<Schema.Schema.Type<T>>(result))
        ),

      updateNode: <T extends NodeSchema>(id: string, properties: Partial<T["members"]>) =>
        Effect.tryPromise(() =>
          driver.executeQuery(
            "MATCH (n) WHERE n.id = $id SET n += $props RETURN n",
            { id, props: properties }
          )
        ).pipe(
          Effect.map((result) => fromNeo4jNode<Schema.Schema.Type<T>>(result))
        ),

      findNode: <T extends NodeSchema>(id: string) =>
        Effect.tryPromise(() =>
          driver.executeQuery(
            "MATCH (n) WHERE n.id = $id RETURN n",
            { id }
          )
        ).pipe(
          Effect.map((result) =>
            result.records.length > 0
              ? Option.some(fromNeo4jNode<Schema.Schema.Type<T>>(result))
              : Option.none<Node<Schema.Schema.Type<T>>>()
          )
        ),

      deleteNode: (id: string) =>
        Effect.tryPromise(() =>
          driver.executeQuery(
            "MATCH (n) WHERE n.id = $id DETACH DELETE n",
            { id }
          )
        ),

      createRelationship: (from: string, to: string, type: string, properties = {}) =>
        Effect.tryPromise(() =>
          driver.executeQuery(
            `
            MATCH (from) WHERE from.id = $fromId
            MATCH (to) WHERE to.id = $toId
            CREATE (from)-[r:${type} $props]->(to)
            RETURN r
            `,
            {
              fromId: from,
              toId: to,
              props: { ...properties, id: crypto.randomUUID() }
            }
          )
        ).pipe(
          Effect.map(fromNeo4jRelationship)
        ),

      findRelationships: (nodeId: string, direction: "incoming" | "outgoing" | "both") =>
        Effect.tryPromise(() => {
          const query = direction === "both"
            ? "MATCH (n)-[r]-(other) WHERE n.id = $nodeId RETURN r"
            : direction === "outgoing"
            ? "MATCH (n)-[r]->(other) WHERE n.id = $nodeId RETURN r"
            : "MATCH (n)<-[r]-(other) WHERE n.id = $nodeId RETURN r"

          return driver.executeQuery(query, { nodeId })
        }).pipe(
          Effect.map(fromNeo4jRelationships)
        ),

      query: <T>(cypher: string, params?: Record<string, unknown>) =>
        Effect.tryPromise(() => driver.executeQuery(cypher, params)).pipe(
          Effect.map((result) => result as unknown as T)
        ),

      findSimilar: (nodeId: string, limit = 10) =>
        Effect.tryPromise(() =>
          driver.executeQuery(
            `
            MATCH (n)-[r]-(similar)
            WHERE n.id = $nodeId
            WITH similar, count(r) as commonRelations
            ORDER BY commonRelations DESC
            LIMIT $limit
            RETURN similar as n
            `,
            { nodeId, limit }
          )
        ).pipe(
          Effect.map(fromNeo4jNodes)
        ),

      search: (query: string, schemas?: Array<NodeSchema>) =>
        Effect.tryPromise(() => {
          const schemaFilter = schemas?.length
            ? `AND any(label IN labels(n) WHERE label IN $schemas)`
            : ""

          return driver.executeQuery(
            `
            MATCH (n)
            WHERE (n.name CONTAINS $query OR n.content CONTAINS $query)
            ${schemaFilter}
            RETURN n
            LIMIT 100
            `,
            {
              query,
              schemas: schemas?.map((s) => getIdentifier(s))
            }
          )
        }).pipe(
          Effect.map(fromNeo4jNodes)
        ),

      transaction: <T>(fn: (tx: Transaction) => Effect.Effect<T, Error>) =>
        Effect.gen(function*(_) {
          const session = driver.session()
          const tx = yield* Effect.tryPromise(() => session.beginTransaction())

          try {
            const result = yield* fn(tx)
            yield* Effect.tryPromise(() => tx.commit())
            return result
          } catch (error) {
            yield* Effect.tryPromise(() => tx.rollback())
            throw error
          } finally {
            yield* Effect.tryPromise(() => session.close())
          }
        })
    }

    return service
  })
)
