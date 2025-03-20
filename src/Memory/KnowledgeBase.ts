import { Effect, Option } from "effect"
import type { Component, Decision, Knowledge, Project, Relation, Requirement, Task } from "./Domain/KnowledgeBase.js"
import { Memory } from "./Memory.js"

export class KnowledgeBase extends Effect.Service<KnowledgeBase>()("KnowledgeBase", {
  scoped: Effect.gen(function*(_) {
    const memory = yield* Memory

    // Project operations
    const createProject = Effect.fn("createProject")(
      (project: Project) => memory.createNode(project)
    )

    const findProject = Effect.fn("findProject")(
      (id: string) =>
        memory.findNode(id).pipe(
          Effect.map((result) =>
            result.records.length > 0
              ? Option.some(result.records[0].get("n").properties as Project)
              : Option.none()
          )
        )
    )

    // Requirement operations
    const createRequirement = Effect.fn("createRequirement")(
      (requirement: Requirement) => memory.createNode(requirement)
    )

    const findRequirement = Effect.fn("findRequirement")(
      (id: string) =>
        memory.findNode(id).pipe(
          Effect.map((result) =>
            result.records.length > 0
              ? Option.some(result.records[0].get("n").properties as Requirement)
              : Option.none()
          )
        )
    )

    // Decision operations
    const createDecision = Effect.fn("createDecision")(
      (decision: Decision) => memory.createNode(decision)
    )

    const findDecision = Effect.fn("findDecision")(
      (id: string) =>
        memory.findNode(id).pipe(
          Effect.map((result) =>
            result.records.length > 0
              ? Option.some(result.records[0].get("n").properties as Decision)
              : Option.none()
          )
        )
    )

    // Knowledge operations
    const createKnowledge = Effect.fn("createKnowledge")(
      (knowledge: Knowledge) => memory.createNode(knowledge)
    )

    const findKnowledge = Effect.fn("findKnowledge")(
      (id: string) =>
        memory.findNode(id).pipe(
          Effect.map((result) =>
            result.records.length > 0
              ? Option.some(result.records[0].get("n").properties as Knowledge)
              : Option.none()
          )
        )
    )

    // Task operations
    const createTask = Effect.fn("createTask")(
      (task: Task) => memory.createNode(task)
    )

    const findTask = Effect.fn("findTask")(
      (id: string) =>
        memory.findNode(id).pipe(
          Effect.map((result) =>
            result.records.length > 0
              ? Option.some(result.records[0].get("n").properties as Task)
              : Option.none()
          )
        )
    )

    // Component operations
    const createComponent = Effect.fn("createComponent")(
      (component: Component) => memory.createNode(component)
    )

    const findComponent = Effect.fn("findComponent")(
      (id: string) =>
        memory.findNode(id).pipe(
          Effect.map((result) =>
            result.records.length > 0
              ? Option.some(result.records[0].get("n").properties as Component)
              : Option.none()
          )
        )
    )

    // Relationship operations
    const createRelation = Effect.fn("createRelation")(
      (relation: Relation) => memory.createRelationship(relation)
    )

    const findRelations = Effect.fn("findRelations")(
      (nodeId: string, direction: "incoming" | "outgoing" | "both" = "both") =>
        memory.findRelationships(nodeId, direction).pipe(
          Effect.map((result) => result.records.map((r) => r.get("r").properties as Relation))
        )
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
