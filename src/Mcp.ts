import { Schema } from "effect"

export class TextContent extends Schema.Class<TextContent>("TextContent")({
  type: Schema.Literal("text"),
  text: Schema.String
}) {}

export class ImageContent extends Schema.Class<ImageContent>("ImageContent")({
  type: Schema.Literal("image"),
  data: Schema.StringFromBase64,
  mimeType: Schema.Literal("image/png", "image/jpeg", "image/gif", "image/webp")
}) {}

export class Content extends Schema.Union(
  TextContent,
  ImageContent
) {}

export const RpcSuccess = Schema.Struct({
  content: Schema.Array(Content)
})

export const ProtocolError = Schema.Struct({
  code: Schema.Number,
  message: Schema.String
})

export const ToolError = Schema.Struct({
  content: Schema.Array(Content),
  isError: Schema.Literal(true)
})

export const RpcResponse = Schema.Union(RpcSuccess, ToolError)

export class ServerError extends Schema.TaggedError<ServerError>()("ServerError", {
  code: Schema.Number,
  message: Schema.String
}) {}
