#!/usr/bin/env node

import { CliConfig } from "@effect/cli"
import { DevTools } from "@effect/experimental"
import { FileSystem } from "@effect/platform"
import * as NodeContext from "@effect/platform-node/NodeContext"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import { Inspectable } from "effect"
import * as Effect from "effect/Effect"
import { run } from "./Cli.js"

run(process.argv).pipe(
  Effect.catchAllCause((cause) =>
    Effect.flatMap(
      FileSystem.FileSystem,
      (FS) =>
        FS.writeFileString(
          "/home/jpowers/error.log",
          Inspectable.format({
            cause,
            path: process.env.MEMORY_FILE_PATH
          }),
          { flag: "a" }
        )
    )
  ),
  Effect.provide([
    NodeContext.layer,
    DevTools.layer(),
    CliConfig.layer({
      showBuiltIns: false
    })
  ]),
  NodeRuntime.runMain()
)
