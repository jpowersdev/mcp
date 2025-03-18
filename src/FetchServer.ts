/**
 * @since 1.0.0
 * @link https://github.com/modelcontextprotocol/servers/tree/main/src/fetch
 */

import { Headers, HttpClient, HttpClientRequest } from "@effect/platform"
import { NodeHttpClient } from "@effect/platform-node"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { Readability } from "@mozilla/readability"
import { Cause, Effect, Option, Runtime } from "effect"
import { JSDOM } from "jsdom"
import * as Robots from "robots-parser"
import { RpcSuccess, TextContent, ToolError } from "./Mcp.js"

const { default: robotsParser } = Robots

const DEFAULT_USER_AGENT_AUTONOMOUS =
  "ModelContextProtocol/1.0 (Autonomous; +https://github.com/modelcontextprotocol/servers)"

interface FetchParams {
  url: string
  maxLength?: number
  startIndex?: number
  raw?: boolean
}

export class FetchServer extends Effect.Service<FetchServer>()("FetchServer", {
  accessors: true,
  dependencies: [NodeHttpClient.layerUndici],
  effect: Effect.gen(function*() {
    const client = yield* HttpClient.HttpClient.pipe(
      Effect.map(HttpClient.mapRequest(HttpClientRequest.setHeader("User-Agent", DEFAULT_USER_AGENT_AUTONOMOUS)))
    )

    const extractContentFromHtml = (html: string): string => {
      const dom = new JSDOM(html)
      const reader = new Readability(dom.window.document)
      const article = reader.parse()
      return article?.textContent || "Page failed to be simplified from HTML"
    }

    const getRobotsTxtUrl = (url: string): string => {
      const parsed = new URL(url)
      return `${parsed.protocol}//${parsed.hostname}/robots.txt`
    }

    const isAllowedToFetchUrl = (url: string) =>
      Effect.gen(function*() {
        const robotsTxtUrl = getRobotsTxtUrl(url)
        const response = yield* client.get(robotsTxtUrl)

        if (response.status === 401 || response.status === 403) {
          return Effect.fail(
            new Error(
              `When fetching robots.txt (${robotsTxtUrl}), received status ${response.status} so assuming that autonomous fetching is not allowed`
            )
          )
        }

        if (response.status >= 400 && response.status < 500) {
          return Effect.succeed(true)
        }

        const robotsTxt = yield* response.text
        const processedRobotTxt = robotsTxt
          .split("\n")
          .filter((line) => !line.trim().startsWith("#"))
          .join("\n")

        const robots = robotsParser(robotsTxtUrl, processedRobotTxt)

        if (!robots.isAllowed(url, DEFAULT_USER_AGENT_AUTONOMOUS)) {
          return Effect.fail(
            new Error(
              `The site's robots.txt (${robotsTxtUrl}) specifies that autonomous fetching of this page is not allowed`
            )
          )
        }

        return Effect.succeed(true)
      })

    const fetchUrl = (url: string, forceRaw = false) =>
      Effect.gen(function*() {
        const response = yield* client.get(url)

        const pageRaw = yield* response.text
        const contentType = Headers.get("content-type")(response.headers).pipe(
          Option.getOrElse(() => "")
        )

        const isPageHtml = pageRaw.toLowerCase().includes("<html") ||
          contentType.toLowerCase().includes("text/html")

        if (!isPageHtml || forceRaw) {
          return yield* Effect.succeed({
            content: pageRaw,
            prefix: `Content type ${contentType} cannot be simplified to markdown, but here is the raw content:\n`
          })
        }

        return yield* Effect.succeed({
          content: extractContentFromHtml(pageRaw),
          prefix: ""
        })
      })

    const server = new Server({
      name: "fetch-server",
      version: "1.0.0"
    }, {
      capabilities: {
        tools: {}
      }
    })

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [{
        name: "fetch",
        description:
          "Fetches a URL from the internet and optionally extracts its contents as markdown. This tool grants internet access to fetch the most up-to-date information.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "URL to fetch"
            },
            maxLength: {
              type: "number",
              description: "Maximum number of characters to return",
              default: 5000,
              minimum: 0,
              maximum: 1000000
            },
            startIndex: {
              type: "number",
              description: "Starting index for content retrieval",
              default: 0,
              minimum: 0
            },
            raw: {
              type: "boolean",
              description: "Whether to return raw content instead of simplified markdown",
              default: false
            }
          },
          required: ["url"]
        }
      }]
    }))

    const runPromise = Runtime.runPromise(yield* Effect.runtime())

    server.setRequestHandler(CallToolRequestSchema, (request, { signal }) =>
      Effect.gen(function*() {
        const { args, name } = request.params

        if (name !== "fetch") {
          return yield* Effect.fail(new Error(`Tool ${name} not found`))
        }

        if (!args) {
          return yield* Effect.fail(new Error("No arguments provided"))
        }

        return yield* Effect.gen(function*() {
          const params = args as unknown as FetchParams
          if (!params?.url) {
            return yield* Effect.fail(new Error("URL is required"))
          }

          yield* isAllowedToFetchUrl(params.url)
          const result = yield* fetchUrl(params.url, params.raw)

          const startIndex = params.startIndex || 0
          const maxLength = params.maxLength || 5000

          if (startIndex >= result.content.length) {
            return "No more content available."
          }

          const truncatedContent = result.content.slice(startIndex, startIndex + maxLength)

          if (!truncatedContent) {
            return "No more content available."
          }

          const remainingContent = result.content.length - (startIndex + truncatedContent.length)
          let finalContent = `${result.prefix}Contents of ${params.url}:\n${truncatedContent}`

          if (truncatedContent.length === maxLength && remainingContent > 0) {
            const nextStart = startIndex + truncatedContent.length
            finalContent +=
              `\n\nContent truncated. Call the fetch tool with a start_index of ${nextStart} to get more content.`
          }

          return finalContent
        })
      }).pipe(
        Effect.map((content) =>
          RpcSuccess.make({
            content: [
              TextContent.make({
                type: "text",
                text: content
              })
            ]
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

    const run = Effect.gen(function*() {
      const transport = new StdioServerTransport()
      yield* Effect.tryPromise(() => server.connect(transport))
      console.error("Fetch MCP Server running on stdio")
    })

    return {
      server,
      run
    } as const
  })
}) {}
