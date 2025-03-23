import { ParseResult, Schema } from "effect"
import { Node, Relation } from "./KnowledgeBase.js"

export class MemoryError extends Schema.TaggedError<MemoryError>()("MemoryError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Unknown)
}) {}

export const Result = (properties: Schema.Schema.Any) =>
  Schema.Struct({
    summary: Schema.Any,
    records: Schema.Array(
      Schema.Struct({
        properties
      })
    )
  })

export const NodeFromResult = Schema.transformOrFail(
  Schema.typeSchema(Result(Node)),
  Schema.typeSchema(Node),
  {
    decode: (result) => ParseResult.validate(Node)(result.records[0].properties),
    encode: (node) => ParseResult.decode(Result(Node))({ summary: {}, records: [{ properties: node }] }),
    strict: true
  }
)

export const RelationFromResult = Schema.transformOrFail(
  Schema.typeSchema(Result(Relation)),
  Schema.typeSchema(Relation),
  {
    decode: (result) => ParseResult.validate(Relation)(result.records[0].properties),
    encode: (relation) => ParseResult.decode(Result(Relation))({ summary: {}, records: [{ properties: relation }] }),
    strict: true
  }
)
