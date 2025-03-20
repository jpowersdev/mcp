import { JSONSchema, Schema, SchemaAST, String } from "effect"

// Project operations
export const CreateProjectRequest = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  status: Schema.String,
  priority: Schema.String,
  startDate: Schema.Number,
  endDate: Schema.optional(Schema.Number),
  tags: Schema.Array(Schema.String)
}).annotations({
  description: "Create a new project in the knowledge graph"
})

export const FindProjectRequest = Schema.Struct({
  id: Schema.String
}).annotations({
  description: "Find a project by its ID"
})

// Requirement operations
export const CreateRequirementRequest = Schema.Struct({
  title: Schema.String,
  description: Schema.String,
  status: Schema.String,
  priority: Schema.String,
  projectId: Schema.String,
  tags: Schema.Array(Schema.String)
}).annotations({
  description: "Create a new requirement in the knowledge graph"
})

export const FindRequirementRequest = Schema.Struct({
  id: Schema.String
}).annotations({
  description: "Find a requirement by its ID"
})

// Decision operations
export const CreateDecisionRequest = Schema.Struct({
  title: Schema.String,
  description: Schema.String,
  rationale: Schema.String,
  alternatives: Schema.Array(Schema.String),
  status: Schema.String,
  projectId: Schema.String,
  tags: Schema.Array(Schema.String)
}).annotations({
  description: "Create a new decision in the knowledge graph"
})

export const FindDecisionRequest = Schema.Struct({
  id: Schema.String
}).annotations({
  description: "Find a decision by its ID"
})

// Knowledge operations
export const CreateKnowledgeRequest = Schema.Struct({
  title: Schema.String,
  content: Schema.String,
  type: Schema.String,
  source: Schema.String,
  projectId: Schema.String,
  tags: Schema.Array(Schema.String)
}).annotations({
  description: "Create a new knowledge entry in the knowledge graph"
})

export const FindKnowledgeRequest = Schema.Struct({
  id: Schema.String
}).annotations({
  description: "Find a knowledge entry by its ID"
})

// Task operations
export const CreateTaskRequest = Schema.Struct({
  title: Schema.String,
  description: Schema.String,
  status: Schema.String,
  priority: Schema.String,
  projectId: Schema.String,
  assignedTo: Schema.optional(Schema.String),
  dueDate: Schema.optional(Schema.Number),
  tags: Schema.Array(Schema.String)
}).annotations({
  description: "Create a new task in the knowledge graph"
})

export const FindTaskRequest = Schema.Struct({
  id: Schema.String
}).annotations({
  description: "Find a task by its ID"
})

// Component operations
export const CreateComponentRequest = Schema.Struct({
  name: Schema.String,
  description: Schema.String,
  type: Schema.String,
  projectId: Schema.String,
  tags: Schema.Array(Schema.String)
}).annotations({
  description: "Create a new component in the knowledge graph"
})

export const FindComponentRequest = Schema.Struct({
  id: Schema.String
}).annotations({
  description: "Find a component by its ID"
})

// Relationship operations
export const CreateRelationRequest = Schema.Struct({
  fromId: Schema.String,
  toId: Schema.String,
  type: Schema.String,
  description: Schema.optional(Schema.String),
  metadata: Schema.optional(Schema.Record({
    key: Schema.String,
    value: Schema.Unknown
  }))
}).annotations({
  description: "Create a new relationship between nodes in the knowledge graph"
})

export const FindRelationsRequest = Schema.Struct({
  nodeId: Schema.String,
  direction: Schema.Union(
    Schema.Literal("incoming"),
    Schema.Literal("outgoing"),
    Schema.Literal("both")
  )
}).annotations({
  description: "Find relationships for a node in the knowledge graph"
})

const convertTool = <A, I, R>(
  name: string,
  schema: Schema.Schema<A, I, R>
) => ({
  name: String.pascalToSnake(name),
  description: getDescription(schema.ast),
  inputSchema: makeJsonSchema(SchemaAST.omit(schema.ast, ["_tag"]))
})

const makeJsonSchema = (ast: SchemaAST.AST): JSONSchema.JsonSchema7 => {
  const $defs = {}
  const schema = JSONSchema.fromAST(ast, {
    definitions: $defs,
    topLevelReferenceStrategy: "skip"
  })
  if (Object.keys($defs).length === 0) return schema
  ;(schema as any).$defs = $defs
  return schema
}

const getDescription = (ast: SchemaAST.AST): string => {
  const annotations = ast._tag === "Transformation"
    ? {
      ...ast.to.annotations,
      ...ast.annotations
    }
    : ast.annotations
  return SchemaAST.DescriptionAnnotationId in annotations
    ? (annotations[SchemaAST.DescriptionAnnotationId] as string)
    : ""
}

// Tool definitions
export const MemoryTools = {
  createProject: convertTool(
    "createProject",
    CreateProjectRequest
  ),
  findProject: convertTool(
    "findProject",
    FindProjectRequest
  ),
  createRequirement: convertTool(
    "createRequirement",
    CreateRequirementRequest
  ),
  findRequirement: convertTool(
    "findRequirement",
    FindRequirementRequest
  ),
  createDecision: convertTool(
    "createDecision",
    CreateDecisionRequest
  ),
  findDecision: convertTool(
    "findDecision",
    FindDecisionRequest
  ),
  createKnowledge: convertTool(
    "createKnowledge",
    CreateKnowledgeRequest
  ),
  findKnowledge: convertTool(
    "findKnowledge",
    FindKnowledgeRequest
  ),
  createTask: convertTool(
    "createTask",
    CreateTaskRequest
  ),
  findTask: convertTool(
    "findTask",
    FindTaskRequest
  ),
  createComponent: convertTool(
    "createComponent",
    CreateComponentRequest
  ),
  findComponent: convertTool(
    "findComponent",
    FindComponentRequest
  ),
  createRelation: convertTool(
    "createRelation",
    CreateRelationRequest
  ),
  findRelations: convertTool(
    "findRelations",
    FindRelationsRequest
  )
} as const
