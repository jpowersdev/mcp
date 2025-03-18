import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["./test/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    exclude: [],
    globals: true,
    coverage: {
      provider: "v8"
    },
    alias: {
      "@jpowersdev/mcp": new URL("./src", import.meta.url).pathname,
      "@jpowersdev/mcp/test": new URL("./test", import.meta.url).pathname
    }
  }
})
