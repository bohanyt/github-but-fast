import { describe, expect, it } from "vitest";
import { QuickJsExecutor } from "../src/local/quickjs-executor";

describe("QuickJsExecutor", () => {
  it("runs parallel host tool calls and returns compact JSON", async () => {
    const executor = new QuickJsExecutor({ timeoutMs: 5_000 });
    const outcome = await executor.execute(
      `async () => {
        const [a, b, c] = await Promise.all([
          codemode.double({ value: 2 }),
          codemode.double({ value: 3 }),
          codemode.double({ value: 4 })
        ]);
        return { total: a + b + c };
      }`,
      {
        double: async (input: unknown) => {
          const value = (input as { value: number }).value;
          return value * 2;
        }
      }
    );

    expect(outcome.error).toBeUndefined();
    expect(outcome.result).toEqual({ total: 18 });
  });

  it("does not expose Node process, require, or fetch", async () => {
    const executor = new QuickJsExecutor({ timeoutMs: 5_000 });
    const outcome = await executor.execute(
      `async () => ({
        process: typeof process,
        require: typeof require,
        fetch: typeof fetch
      })`,
      {}
    );

    expect(outcome.error).toBeUndefined();
    expect(outcome.result).toEqual({
      process: "undefined",
      require: "undefined",
      fetch: "undefined"
    });
  });

  it("rejects unknown tools inside the sandbox", async () => {
    const executor = new QuickJsExecutor({ timeoutMs: 5_000 });
    const outcome = await executor.execute(
      `async () => codemode.notThere({})`,
      {}
    );

    expect(outcome.error).toMatch(/Unknown tool/);
  });
});
