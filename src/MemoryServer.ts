/**
 * @since 1.0.0
 * @link https://github.com/modelcontextprotocol/servers/tree/main/src/memory
 */

import { FileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import type { Array } from "effect"
import { Boolean, Cause, Config, Effect, Inspectable, Match, pipe, Runtime, Schema } from "effect"
import * as path from "path"
import { RpcSuccess, ServerError, TextContent, ToolError } from "./Mcp.js"

// If MEMORY_FILE_PATH is just a filename, put it in the same directory as the script
const MEMORY_FILE_PATH = Config.string("MEMORY_FILE_PATH").pipe(
  Config.withDefault("memory.json"),
  Config.map((p) =>
    Boolean.match(path.isAbsolute(p), {
      onTrue: () => p,
      onFalse: () => path.join(process.cwd(), p)
    })
  )
)

// We are storing our memory using entities, relations, and observations in a graph structure
interface Entity {
  name: string
  entityType: string
  observations: ReadonlyArray<string>
}

const Entity = Schema.Struct({
  name: Schema.String,
  entityType: Schema.String,
  observations: Schema.Array(Schema.String)
})

interface Relation {
  from: string
  to: string
  relationType: string
}

const Relation = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  relationType: Schema.String
})

interface KnowledgeGraph {
  entities: ReadonlyArray<Entity>
  relations: ReadonlyArray<Relation>
}

const KnowledgeGraph = Schema.Struct({
  entities: Schema.Array(Entity),
  relations: Schema.Array(Relation)
})

const emptyGraph = KnowledgeGraph.make({ entities: [], relations: [] })

// The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
class KnowledgeGraphManager extends Effect.Service<KnowledgeGraphManager>()("KnowledgeGraphManager", {
  dependencies: [NodeFileSystem.layer],
  effect: Effect.gen(function*() {
    const FS = yield* FileSystem.FileSystem
    const memoryFilePath = yield* MEMORY_FILE_PATH

    const schema = Schema.parseJson(KnowledgeGraph)
    const encode = Schema.encode(schema)
    const decode = Schema.decode(schema)

    const loadGraph = FS.readFileString(memoryFilePath).pipe(
      Effect.flatMap(decode),
      Effect.withSpan("loadGraph", {
        attributes: {
          memoryFilePath
        }
      })
    )

    const saveGraph = (graph: KnowledgeGraph) =>
      encode(graph).pipe(
        Effect.flatMap((data) => FS.writeFileString(memoryFilePath, data)),
        Effect.withSpan("saveGraph", {
          attributes: {
            memoryFilePath
          }
        })
      )

    const createEntities = (entities: Array<Entity>) =>
      Effect.gen(function*() {
        const graph = yield* loadGraph
        const newEntities = entities.filter((e) =>
          !graph.entities.some((existingEntity: Entity) => existingEntity.name === e.name)
        )
        yield* saveGraph({
          ...graph,
          entities: [...graph.entities, ...newEntities]
        })
        return newEntities
      }).pipe(
        Effect.withSpan("createEntities", {
          attributes: {
            entities: entities.map((e) => e.name)
          }
        })
      )

    const createRelations = (relations: Array<Relation>) =>
      Effect.gen(function*() {
        const graph = yield* loadGraph
        const newRelations = relations.filter((r) =>
          !graph.relations.some((existingRelation: Relation) =>
            existingRelation.from === r.from &&
            existingRelation.to === r.to &&
            existingRelation.relationType === r.relationType
          )
        )
        yield* saveGraph({
          ...graph,
          relations: [...graph.relations, ...newRelations]
        })
        return newRelations
      }).pipe(
        Effect.withSpan("createRelations", {
          attributes: {
            relations: relations.map((r) => r.relationType)
          }
        })
      )

    const addObservations = (
      observations: Array<{ entityName: string; contents: Array<string> }>
    ) =>
      Effect.gen(function*() {
        const graph = yield* loadGraph

        const results = observations.map((o) => {
          const entity = graph.entities.find((e: Entity) => e.name === o.entityName)
          if (!entity) {
            throw new Error(`Entity with name ${o.entityName} not found`)
          }
          const newObservations = o.contents.filter((content) => !entity.observations.includes(content))
          Object.assign(entity, { observations: [...entity.observations, ...newObservations] })
          return { entityName: o.entityName, addedObservations: newObservations }
        })
        yield* saveGraph(graph)
        return results
      }).pipe(
        Effect.withSpan("addObservations", {
          attributes: {
            observations: observations.map((o) => o.entityName)
          }
        })
      )

    const deleteEntities = (entityNames: Array<string>) =>
      Effect.gen(function*() {
        const graph = yield* loadGraph
        yield* saveGraph({
          entities: graph.entities.filter((e: Entity) => !entityNames.includes(e.name)),
          relations: graph.relations.filter((r: Relation) =>
            !entityNames.includes(r.from) && !entityNames.includes(r.to)
          )
        })
      }).pipe(
        Effect.withSpan("deleteEntities", {
          attributes: {
            entityNames
          }
        })
      )

    const deleteObservations = (
      deletions: Array<{ entityName: string; observations: Array<string> }>
    ) =>
      Effect.gen(function*() {
        const graph = yield* loadGraph
        deletions.forEach((d) => {
          const entity = graph.entities.find((e: Entity) => e.name === d.entityName)
          if (entity) {
            Object.assign(entity, {
              observations: entity.observations.filter((o: string) => !d.observations.includes(o))
            })
          }
        })
        yield* saveGraph(graph)
      }).pipe(
        Effect.withSpan("deleteObservations", {
          attributes: {
            deletions: deletions.map((d) => d.entityName)
          }
        })
      )

    const deleteRelations = (relations: Array<Relation>) =>
      Effect.gen(function*() {
        const graph = yield* loadGraph
        yield* saveGraph({
          ...graph,
          relations: graph.relations.filter((r: Relation) =>
            !relations.some((delRelation) =>
              r.from === delRelation.from &&
              r.to === delRelation.to &&
              r.relationType === delRelation.relationType
            )
          )
        })
      }).pipe(
        Effect.withSpan("deleteRelations", {
          attributes: {
            relations: relations.map((r) => r.relationType)
          }
        })
      )

    const readGraph = loadGraph.pipe(
      Effect.withSpan("readGraph", {
        attributes: {
          memoryFilePath
        }
      })
    )

    const searchNodes = (query: string) =>
      Effect.gen(function*() {
        const graph = yield* loadGraph

        const filteredEntities = graph.entities.filter((e: Entity) =>
          e.name.toLowerCase().includes(query.toLowerCase()) ||
          e.entityType.toLowerCase().includes(query.toLowerCase()) ||
          e.observations.some((o: string) => o.toLowerCase().includes(query.toLowerCase()))
        )

        const filteredEntityNames = new Set(filteredEntities.map((e: Entity) => e.name))

        const filteredRelations = graph.relations.filter((r: Relation) =>
          filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
        )

        return {
          entities: filteredEntities,
          relations: filteredRelations
        }
      }).pipe(
        Effect.withSpan("searchNodes", {
          attributes: {
            query
          }
        })
      )

    const openNodes = (names: Array<string>) =>
      Effect.gen(function*() {
        const graph = yield* loadGraph

        const filteredEntities = graph.entities.filter((e: Entity) => names.includes(e.name))
        const filteredEntityNames = new Set(filteredEntities.map((e: Entity) => e.name))

        const filteredRelations = graph.relations.filter((r: Relation) =>
          filteredEntityNames.has(r.from) && filteredEntityNames.has(r.to)
        )

        return {
          entities: filteredEntities,
          relations: filteredRelations
        }
      }).pipe(
        Effect.withSpan("openNodes", {
          attributes: {
            names
          }
        })
      )

    if (!(yield* FS.exists(memoryFilePath))) {
      const parts = memoryFilePath.split("/")
      const dir = parts.slice(0, -1).join("/")
      if (dir !== "") {
        yield* FS.makeDirectory(dir, { recursive: true })
      }
      yield* saveGraph(emptyGraph)
    }

    return {
      loadGraph,
      saveGraph,
      createEntities,
      createRelations,
      addObservations,
      deleteEntities,
      deleteObservations,
      deleteRelations,
      readGraph,
      searchNodes,
      openNodes
    } as const
  }).pipe(
    Effect.withSpan("KnowledgeGraphManager.make")
  )
}) {}

export class MemoryServer extends Effect.Service<MemoryServer>()("MemoryServer", {
  accessors: true,
  dependencies: [KnowledgeGraphManager.Default],
  effect: Effect.gen(function*() {
    const manager = yield* KnowledgeGraphManager

    // The server instance and tools exposed to Claude
    const server = new Server({
      name: "memory-server",
      version: "1.0.0"
    }, {
      capabilities: {
        tools: {}
      }
    })

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "create_entities",
            description: "Create multiple new entities in the knowledge graph",
            inputSchema: {
              type: "object",
              properties: {
                entities: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "The name of the entity" },
                      entityType: { type: "string", description: "The type of the entity" },
                      observations: {
                        type: "array",
                        items: { type: "string" },
                        description: "An array of observation contents associated with the entity"
                      }
                    },
                    required: ["name", "entityType", "observations"]
                  }
                }
              },
              required: ["entities"]
            }
          },
          {
            name: "create_relations",
            description:
              "Create multiple new relations between entities in the knowledge graph. Relations should be in active voice",
            inputSchema: {
              type: "object",
              properties: {
                relations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      from: { type: "string", description: "The name of the entity where the relation starts" },
                      to: { type: "string", description: "The name of the entity where the relation ends" },
                      relationType: { type: "string", description: "The type of the relation" }
                    },
                    required: ["from", "to", "relationType"]
                  }
                }
              },
              required: ["relations"]
            }
          },
          {
            name: "add_observations",
            description: "Add new observations to existing entities in the knowledge graph",
            inputSchema: {
              type: "object",
              properties: {
                observations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      entityName: { type: "string", description: "The name of the entity to add the observations to" },
                      contents: {
                        type: "array",
                        items: { type: "string" },
                        description: "An array of observation contents to add"
                      }
                    },
                    required: ["entityName", "contents"]
                  }
                }
              },
              required: ["observations"]
            }
          },
          {
            name: "delete_entities",
            description: "Delete multiple entities and their associated relations from the knowledge graph",
            inputSchema: {
              type: "object",
              properties: {
                entityNames: {
                  type: "array",
                  items: { type: "string" },
                  description: "An array of entity names to delete"
                }
              },
              required: ["entityNames"]
            }
          },
          {
            name: "delete_observations",
            description: "Delete specific observations from entities in the knowledge graph",
            inputSchema: {
              type: "object",
              properties: {
                deletions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      entityName: { type: "string", description: "The name of the entity containing the observations" },
                      observations: {
                        type: "array",
                        items: { type: "string" },
                        description: "An array of observations to delete"
                      }
                    },
                    required: ["entityName", "observations"]
                  }
                }
              },
              required: ["deletions"]
            }
          },
          {
            name: "delete_relations",
            description: "Delete multiple relations from the knowledge graph",
            inputSchema: {
              type: "object",
              properties: {
                relations: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      from: { type: "string", description: "The name of the entity where the relation starts" },
                      to: { type: "string", description: "The name of the entity where the relation ends" },
                      relationType: { type: "string", description: "The type of the relation" }
                    },
                    required: ["from", "to", "relationType"]
                  },
                  description: "An array of relations to delete"
                }
              },
              required: ["relations"]
            }
          },
          {
            name: "read_graph",
            description: "Read the entire knowledge graph",
            inputSchema: {
              type: "object",
              properties: {}
            }
          },
          {
            name: "search_nodes",
            description: "Search for nodes in the knowledge graph based on a query",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query to match against entity names, types, and observation content"
                }
              },
              required: ["query"]
            }
          },
          {
            name: "open_nodes",
            description: "Open specific nodes in the knowledge graph by their names",
            inputSchema: {
              type: "object",
              properties: {
                names: {
                  type: "array",
                  items: { type: "string" },
                  description: "An array of entity names to retrieve"
                }
              },
              required: ["names"]
            }
          }
        ]
      }
    })

    const runPromise = Runtime.runPromise(yield* Effect.runtime())

    server.setRequestHandler(CallToolRequestSchema, (request, { signal }) =>
      pipe(
        Effect.gen(function*() {
          if (!request.params.arguments) {
            return yield* Effect.fail(
              new Error(`No arguments provided for tool: ${request.params.name}`)
            )
          }

          return yield* Match.value(request.params).pipe(
            Match.discriminatorsExhaustive("name")({
              create_entities: (params) => manager.createEntities(params.arguments?.entities as any),
              create_relations: (params) => manager.createRelations(params.arguments?.relations as any),
              add_observations: (params) => manager.addObservations(params.arguments?.observations as any),
              read_graph: () => manager.readGraph,
              search_nodes: (params) => manager.searchNodes(params.arguments?.query as any),
              open_nodes: (params) => manager.openNodes(params.arguments?.names as any),
              delete_entities: (params) =>
                manager.deleteEntities(params.arguments?.entityNames as any).pipe(
                  Effect.map(() => "Entities deleted successfully")
                ),
              delete_observations: (params) =>
                manager.deleteObservations(params.arguments?.deletions as any).pipe(
                  Effect.map(() => "Observations deleted successfully")
                ),
              delete_relations: (params) =>
                manager.deleteRelations(params.arguments?.relations as any).pipe(
                  Effect.map(() => "Relations deleted successfully")
                )
            })
          )
        }),
        Effect.map(
          Match.type<unknown>().pipe(
            Match.when(Match.string, (text) =>
              TextContent.make({
                type: "text",
                text
              })),
            Match.orElse((obj) =>
              TextContent.make({
                type: "text",
                text: JSON.stringify(obj, null, 2)
              })
            )
          )
        ),
        Effect.map((content) =>
          RpcSuccess.make({
            content: [content]
          })
        ),
        Effect.withSpan("CallToolRequest", {
          attributes: {
            tool: request.params.name,
            arguments: request.params.arguments
          }
        }),
        Effect.catchAllCause((cause) =>
          Effect.gen(function*() {
            if (Cause.isInterruptedOnly(cause)) {
              return "Tool execution interrupted"
            }
            if (Cause.isFailType(cause)) {
              yield* Effect.logError(cause)
              return cause.error.message
            }
            yield* Effect.logError(cause)
            return Cause.pretty(cause)
          }).pipe(
            Effect.map((text) =>
              ToolError.make({
                content: [{ type: "text", text }],
                isError: true
              })
            )
          )
        ),
        (effect) => runPromise(effect, { signal })
      ))

    // const run = Effect.acquireUseRelease(
    //   Effect.sync(() => new StdioServerTransport()),
    //   (transport) =>
    //     Effect.tryPromise({
    //       try: () => server.connect(transport),
    //       catch: (cause) =>
    //         new ServerError({
    //           code: 500,
    //           message: Inspectable.format(cause)
    //         })
    //     }),
    //   () => Effect.promise(() => server.close())
    // )

    const run = Effect.gen(function*() {
      const transport = new StdioServerTransport()

      yield* Effect.tryPromise({
        try: () => server.connect(transport),
        catch: (cause) =>
          new ServerError({
            code: 500,
            message: Inspectable.format(cause)
          })
      })
      console.error("Knowledge Graph MCP Server running on stdio")
    })

    return {
      run
    } as const
  }).pipe(
    Effect.withSpan("MemoryServer.make")
  )
}) {}
