import { Schema } from "effect"

// Base node properties that all nodes will have
export const BaseNodeSchema = Schema.Struct({
  id: Schema.String,
  createdAt: Schema.Number,
  updatedAt: Schema.Number,
  createdBy: Schema.String
})

// Project level information
export const Project = Schema.TaggedStruct("Project", {
  ...BaseNodeSchema.fields,
  name: Schema.String,
  description: Schema.String,
  status: Schema.Literal("planning", "in-progress", "completed", "on-hold"),
  goals: Schema.Array(Schema.String),
  tags: Schema.Array(Schema.String)
})

export type Project = Schema.Schema.Type<typeof Project>

// Requirements and specifications
export const Requirement = Schema.TaggedStruct("Requirement", {
  ...BaseNodeSchema.fields,
  title: Schema.String,
  description: Schema.String,
  priority: Schema.Literal("high", "medium", "low"),
  status: Schema.Literal("proposed", "accepted", "rejected", "implemented"),
  rationale: Schema.String
})

export type Requirement = Schema.Schema.Type<typeof Requirement>

// Technical decisions and their context
export const Decision = Schema.TaggedStruct("Decision", {
  ...BaseNodeSchema.fields,
  title: Schema.String,
  description: Schema.String,
  status: Schema.Literal("proposed", "accepted", "rejected", "superseded"),
  context: Schema.String,
  consequences: Schema.Array(Schema.String),
  alternatives: Schema.Array(Schema.String),
  rationale: Schema.String
})

export type Decision = Schema.Schema.Type<typeof Decision>

// Components and technical artifacts
export const Component = Schema.TaggedStruct("Component", {
  ...BaseNodeSchema.fields,
  name: Schema.String,
  type: Schema.Literal("service", "library", "database", "ui", "api", "tool"),
  description: Schema.String,
  status: Schema.Literal("planned", "in-development", "active", "deprecated"),
  responsibilities: Schema.Array(Schema.String),
  dependencies: Schema.Array(Schema.String)
})

export type Component = Schema.Schema.Type<typeof Component>

// Tasks and work items
export const Task = Schema.TaggedStruct("Task", {
  ...BaseNodeSchema.fields,
  title: Schema.String,
  description: Schema.String,
  status: Schema.Literal("todo", "in-progress", "blocked", "completed"),
  priority: Schema.Literal("high", "medium", "low"),
  assignee: Schema.optional(Schema.String),
  estimatedEffort: Schema.optional(Schema.String),
  dependencies: Schema.Array(Schema.String)
})

export type Task = Schema.Schema.Type<typeof Task>

// Knowledge and documentation
export const Knowledge = Schema.TaggedStruct("Knowledge", {
  ...BaseNodeSchema.fields,
  title: Schema.String,
  content: Schema.String,
  type: Schema.Literal("documentation", "guide", "reference", "learning", "insight"),
  tags: Schema.Array(Schema.String),
  relevantComponents: Schema.Array(Schema.String)
})

export type Knowledge = Schema.Schema.Type<typeof Knowledge>

export const Node = Schema.Union(
  Project,
  Requirement,
  Decision,
  Component,
  Task,
  Knowledge
)

export type Node = Schema.Schema.Type<typeof Node>

// Relationship types between nodes
export const RelationTypes = {
  // Project structure relationships
  CONTAINS: "CONTAINS", // Project contains components
  IMPLEMENTS: "IMPLEMENTS", // Component implements requirement
  DEPENDS_ON: "DEPENDS_ON", // Component depends on another component

  // Knowledge relationships
  DOCUMENTS: "DOCUMENTS", // Knowledge documents a component
  RELATES_TO: "RELATES_TO", // Generic relationship between any nodes
  SUPPORTS: "SUPPORTS", // Decision supports requirement
  BLOCKS: "BLOCKS", // Task blocks another task

  // Decision relationships
  AFFECTS: "AFFECTS", // Decision affects component
  SUPERSEDES: "SUPERSEDES", // Decision supersedes another decision

  // Task relationships
  IMPLEMENTS_REQ: "IMPLEMENTS_REQ", // Task implements requirement
  PART_OF: "PART_OF", // Task is part of component

  // Temporal relationships
  PRECEDES: "PRECEDES", // Something comes before another thing
  FOLLOWS: "FOLLOWS" // Something comes after another thing
} as const

// Relationship schema
export const Relation = Schema.Struct({
  ...BaseNodeSchema.fields,
  type: Schema.Literal(...Object.values(RelationTypes)),
  fromId: Schema.String,
  toId: Schema.String,
  properties: Schema.Record({ key: Schema.String, value: Schema.Unknown })
})

export type Relation = Schema.Schema.Type<typeof Relation>
