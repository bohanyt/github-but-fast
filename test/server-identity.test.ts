import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("MCP provider identity", () => {
  it("does not reuse the built-in GitHub provider name", () => {
    for (const path of ["src/local-server.ts", "src/server.ts"]) {
      const text = source(path);
      expect(text).toContain('name: "gbf-readonly"');
      expect(text).not.toContain('name: "github"');
    }
  });
});
