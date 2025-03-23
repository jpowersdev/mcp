import { Effect, Schema } from "effect"
import type { Relation } from "./Domain/KnowledgeBase.js"
import { Component, Decision, Knowledge, Project, Requirement, Task } from "./Domain/KnowledgeBase.js"
import { Result } from "./Domain/Memory.js"
import { Memory } from "./Memory.js"

export class KnowledgeBase extends Effect.Service<KnowledgeBase>()("KnowledgeBase", {
  scoped: Effect.gen(function*(_) {
    const memory = yield* Memory

    const decode = (schema: Schema.Schema.Any) => Schema.decodeUnknown(Result(schema))

    // Project operations
    const createProject = Effect.fn("createProject")(
      (project: Project) => memory.createNode(project)
    )

    const findProject = Effect.fn("findProject")(
      (id: string) =>
        memory.findNode(id).pipe(
          Effect.flatMap(decode(Project))
        )
    )

    // Requirement operations
    const createRequirement = Effect.fn("createRequirement")(
      (requirement: Requirement) =>
        memory.createNode(requirement).pipe(
          Effect.flatMap(decode(Requirement))
        )
    )

    const findRequirement = Effect.fn("findRequirement")(
      (id: string) =>
        memory.findNode(id).pipe(
          Effect.flatMap(decode(Requirement))
        )
    )

    // Decision operations
    const createDecision = Effect.fn("createDecision")(
      (decision: Decision) =>
        memory.createNode(decision).pipe(
          Effect.flatMap(decode(Decision))
        )
    )

    const findDecision = Effect.fn("findDecision")(
      (id: string) =>
        memory.findNode(id).pipe(
          Effect.flatMap(decode(Decision))
        )
    )

    // Knowledge operations
    const createKnowledge = Effect.fn("createKnowledge")(
      (knowledge: Knowledge) =>
        memory.createNode(knowledge).pipe(
          Effect.flatMap(decode(Knowledge))
        )
    )

    const findKnowledge = Effect.fn("findKnowledge")(
      (id: string) =>
        memory.findNode(id).pipe(
          Effect.flatMap(decode(Knowledge))
        )
    )

    // Task operations
    const createTask = Effect.fn("createTask")(
      (task: Task) =>
        memory.createNode(task).pipe(
          Effect.flatMap(decode(Task))
        )
    )

    const findTask = Effect.fn("findTask")(
      (id: string) =>
        memory.findNode(id).pipe(
          Effect.flatMap(decode(Task))
        )
    )

    // Component operations
    const createComponent = Effect.fn("createComponent")(
      (component: Component) =>
        memory.createNode(component).pipe(
          Effect.flatMap(decode(Component))
        )
    )

    const findComponent = Effect.fn("findComponent")(
      (id: string) =>
        memory.findNode(id).pipe(
          Effect.flatMap(decode(Component))
        )
    )

    // Relationship operations
    const createRelation = Effect.fn("createRelation")(
      (relation: Relation) => memory.createRelationship(relation)
    )

    const findRelations = Effect.fn("findRelations")(
      (nodeId: string, direction: "incoming" | "outgoing" | "both" = "both") =>
        memory.findRelationships(nodeId, direction)
    )

    return {
      createProject,
      findProject,
      createRequirement,
      findRequirement,
      createDecision,
      findDecision,
      createKnowledge,
      findKnowledge,
      createTask,
      findTask,
      createComponent,
      findComponent,
      createRelation,
      findRelations
    } as const
  })
}) {}
