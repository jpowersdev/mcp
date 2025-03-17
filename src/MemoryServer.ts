/**
 * @since 1.0.0
 * @link https://github.com/modelcontextprotocol/servers/tree/main/src/memory
 */

import { FileSystem } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import type { PlatformError } from "@effect/platform/Error"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { Boolean, Config, Effect, Match, Runtime } from "effect"
import * as path from "path"

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
  observations: Array<string>
}

interface Relation {
  from: string
  to: string
  relationType: string
}

interface KnowledgeGraph {
  entities: Array<Entity>
  relations: Array<Relation>
}

// The KnowledgeGraphManager class contains all operations to interact with the knowledge graph
class KnowledgeGraphManager extends Effect.Service<KnowledgeGraphManager>()("KnowledgeGraphManager", {
  dependencies: [NodeFileSystem.layer],
  effect: Effect.gen(function*() {
    const FS = yield* FileSystem.FileSystem
    const memoryFilePath = yield* MEMORY_FILE_PATH

    if (!(yield* FS.exists(memoryFilePath))) {
      const parts = memoryFilePath.split("/")
      const dir = parts.slice(0, -1).join("/")
      if (dir !== "") {
        yield* FS.makeDirectory(dir, { recursive: true })
      }
      yield* FS.writeFileString(memoryFilePath, "{}")
    }

    const loadGraph = Effect.gen(function*() {
      try {
        const data = yield* FS.readFileString(memoryFilePath)
        const lines = data.split("\n").filter((line) => line.trim() !== "")
        return lines.reduce((graph: KnowledgeGraph, line) => {
          const item = JSON.parse(line)
          if (item.type === "entity") graph.entities.push(item as Entity)
          if (item.type === "relation") graph.relations.push(item as Relation)
          return graph
        }, { entities: [], relations: [] })
      } catch (error) {
        if (error instanceof Error && "code" in error && (error as any).code === "ENOENT") {
          return { entities: [], relations: [] }
        }
        throw error
      }
    }).pipe(
      Effect.withSpan("loadGraph", {
        attributes: {
          memoryFilePath
        }
      })
    )

    const saveGraph = (graph: KnowledgeGraph) =>
      Effect.gen(function*() {
        const lines = [
          ...graph.entities.map((e) => JSON.stringify({ type: "entity", ...e })),
          ...graph.relations.map((r) => JSON.stringify({ type: "relation", ...r }))
        ]
        yield* FS.writeFileString(memoryFilePath, lines.join("\n"))
      }).pipe(
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
        graph.entities = [...graph.entities, ...newEntities]
        yield* saveGraph(graph)
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
        graph.relations = [...graph.relations, ...newRelations]
        yield* saveGraph(graph)
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
          entity.observations = [...entity.observations, ...newObservations]
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
        graph.entities = graph.entities.filter((e: Entity) => !entityNames.includes(e.name))
        graph.relations = graph.relations.filter((r: Relation) =>
          !entityNames.includes(r.from) && !entityNames.includes(r.to)
        )
        yield* saveGraph(graph)
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
            entity.observations = entity.observations.filter((o: string) => !d.observations.includes(o))
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
        graph.relations = graph.relations.filter((r: Relation) =>
          !relations.some((delRelation) =>
            r.from === delRelation.from &&
            r.to === delRelation.to &&
            r.relationType === delRelation.relationType
          )
        )
        yield* saveGraph(graph)
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
    const knowledgeGraphManager = yield* KnowledgeGraphManager

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

    type ContentResponse = {
      content: Array<{
        type: "text"
        text: string
      }>
    }

    const encode = (text: unknown): ContentResponse => ({
      content: [{
        type: "text",
        text: JSON.stringify(text, null, 2)
      }]
    })

    const runPromise = Runtime.runPromise(yield* Effect.runtime())

    server.setRequestHandler(CallToolRequestSchema, (request) =>
      runPromise(Effect.gen(function*() {
        if (!request.params.arguments) {
          return yield* Effect.fail(
            new Error(`No arguments provided for tool: ${request.params.name}`)
          )
        }

        return yield* Match.value(request.params).pipe(
          Match.withReturnType<Effect.Effect<ContentResponse, PlatformError, never>>(),
          Match.discriminatorsExhaustive("name")({
            create_entities: (params) =>
              knowledgeGraphManager.createEntities(params.arguments?.entities as any).pipe(
                Effect.map(encode)
              ),
            create_relations: (params) =>
              knowledgeGraphManager.createRelations(params.arguments?.relations as any).pipe(
                Effect.map(encode)
              ),
            add_observations: (params) =>
              knowledgeGraphManager.addObservations(params.arguments?.observations as any).pipe(
                Effect.map(encode)
              ),
            delete_entities: (params) =>
              knowledgeGraphManager.deleteEntities(params.arguments?.entityNames as any).pipe(
                Effect.map(() => encode("Entities deleted successfully")
              ),
            delete_observations: (params) =>
              knowledgeGraphManager.deleteObservations(params.arguments?.deletions as any).pipe(
                Effect.map(() => encode("Observations deleted successfully))
              ),
            delete_relations: (params) =>
              knowledgeGraphManager.deleteRelations(params.arguments?.relations as any).pipe(
                Effect.map(() => encode("Relations deleted successfully))
              ),
            read_graph: () =>
              knowledgeGraphManager.readGraph.pipe(
                Effect.map(encode)
              ),
            search_nodes: (params) =>
              knowledgeGraphManager.searchNodes(params.arguments?.query as any).pipe(
                Effect.map(encode)
              ),
            open_nodes: (params) =>
              knowledgeGraphManager.openNodes(params.arguments?.names as any).pipe(
                Effect.map(encode)
              )
          })
        ).pipe(
          Effect.withSpan("CallToolRequest", {
            attributes: {
              tool: request.params.name,
              arguments: request.params.arguments
            }
          })
        )
      })))

    const run = Effect.gen(function*() {
      const transport = new StdioServerTransport()

      yield* Effect.promise(() => server.connect(transport))
      console.error("Knowledge Graph MCP Server running on stdio")
    })

    return {
      run
    } as const
  }).pipe(
    Effect.withSpan("MemoryServer.make")
  )
}) {}
