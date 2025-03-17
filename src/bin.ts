#!/usr/bin/env node

import { CliConfig } from "@effect/cli"
import { DevTools } from "@effect/experimental"
import * as NodeContext from "@effect/platform-node/NodeContext"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import { Cause, Logger } from "effect"
import * as Effect from "effect/Effect"
import { run } from "./Cli.js"

export const layerLogger = Logger.replace(
  Logger.defaultLogger,
  Logger.prettyLogger({
    stderr: true,
    colors: true,
    mode: "tty"
  })
)

run(process.argv).pipe(
  Effect.tapErrorCause((cause) => {
    if (Cause.isInterruptedOnly(cause)) {
      return Effect.void
    }
    return Effect.logError(cause)
  }),
  Effect.provide([
    NodeContext.layer,
    DevTools.layer(),
    CliConfig.layer({
      showBuiltIns: false
    }),
    layerLogger
  ]),
  NodeRuntime.runMain({
    disableErrorReporting: true,
    disablePrettyLogger: true
  })
)
