import { getQuickJS } from "quickjs-emscripten";

type HostFn = (...args: unknown[]) => Promise<unknown>;
type Provider = {
  name: string;
  fns: Record<string, HostFn>;
  positionalArgs?: boolean;
};

type ProvidersOrFns = Provider[] | Record<string, HostFn>;

export interface QuickJsExecutorOptions {
  timeoutMs?: number;
  memoryLimitBytes?: number;
  maxStackBytes?: number;
}

function normalizeProviders(input: ProvidersOrFns): Provider[] {
  if (Array.isArray(input)) return input;
  return [{ name: "codemode", fns: input, positionalArgs: false }];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class QuickJsExecutor {
  readonly timeoutMs: number;
  readonly memoryLimitBytes: number;
  readonly maxStackBytes: number;

  constructor(options: QuickJsExecutorOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.memoryLimitBytes = options.memoryLimitBytes ?? 96 * 1024 * 1024;
    this.maxStackBytes = options.maxStackBytes ?? 2 * 1024 * 1024;
  }

  async execute(code: string, providersOrFns: ProvidersOrFns) {
    const providers = normalizeProviders(providersOrFns);
    const providerMap = new Map(providers.map((provider) => [provider.name, provider]));
    const logs: string[] = [];
    const QuickJS = await getQuickJS();
    const runtime = QuickJS.newRuntime();
    const deadline = Date.now() + this.timeoutMs;

    runtime.setMemoryLimit(this.memoryLimitBytes);
    runtime.setMaxStackSize(this.maxStackBytes);
    runtime.setInterruptHandler(() => Date.now() > deadline);

    const vm = runtime.newContext();

    try {
      const callHost = vm.newFunction("__gbfCall", (providerHandle, fnHandle, argsHandle) => {
        const providerName = vm.getString(providerHandle);
        const fnName = vm.getString(fnHandle);
        const argsJson = vm.getString(argsHandle);
        const deferred = vm.newPromise();

        Promise.resolve()
          .then(async () => {
            const provider = providerMap.get(providerName);
            if (!provider) throw new Error(`Unknown provider: ${providerName}`);
            const fn = provider.fns[fnName];
            if (!fn) throw new Error(`Unknown tool: ${providerName}.${fnName}`);

            const parsed = JSON.parse(argsJson) as unknown;
            if (!Array.isArray(parsed)) throw new Error("Sandbox tool arguments must be an array");
            return provider.positionalArgs ? fn(...parsed) : fn(parsed[0]);
          })
          .then(
            (value) => {
              const serialized = JSON.stringify(value === undefined ? null : value);
              if (serialized === undefined) throw new Error("Tool result is not JSON serializable");
              const handle = vm.newString(serialized);
              deferred.resolve(handle);
              handle.dispose();
            },
            (error) => {
              const handle = vm.newError(errorMessage(error));
              deferred.reject(handle);
              handle.dispose();
            }
          )
          .finally(() => {
            runtime.executePendingJobs();
          });

        return deferred.handle;
      });
      vm.setProp(vm.global, "__gbfCall", callHost);
      callHost.dispose();

      const logHost = vm.newFunction("__gbfLog", (levelHandle, valueHandle) => {
        const level = vm.getString(levelHandle);
        const value = vm.getString(valueHandle);
        logs.push(`[${level}] ${value}`);
      });
      vm.setProp(vm.global, "__gbfLog", logHost);
      logHost.dispose();

      const providerNames = JSON.stringify(providers.map((provider) => provider.name));
      const bootstrap = `
        (() => {
          const providerNames = ${providerNames};
          for (const providerName of providerNames) {
            globalThis[providerName] = new Proxy(Object.create(null), {
              get(_target, property) {
                if (typeof property !== "string") return undefined;
                return (...args) => __gbfCall(providerName, property, JSON.stringify(args))
                  .then((value) => JSON.parse(value));
              }
            });
          }
          const stringifyLog = (args) => args.map((value) => {
            try { return typeof value === "string" ? value : JSON.stringify(value); }
            catch { return String(value); }
          }).join(" ");
          globalThis.console = {
            log: (...args) => __gbfLog("log", stringifyLog(args)),
            warn: (...args) => __gbfLog("warn", stringifyLog(args)),
            error: (...args) => __gbfLog("error", stringifyLog(args))
          };
        })();
      `;
      const bootResult = vm.evalCode(bootstrap, "gbf-bootstrap.js");
      vm.unwrapResult(bootResult).dispose();

      const wrapped = `
        (async () => {
          const value = await (${code})();
          const serialized = JSON.stringify(value === undefined ? null : value);
          if (serialized === undefined) throw new Error("Execution result is not JSON serializable");
          return serialized;
        })()
      `;

      const evalResult = vm.evalCode(wrapped, "gbf-execute.js");
      const promiseHandle = vm.unwrapResult(evalResult);
      const settled = await vm.resolvePromise(promiseHandle);
      promiseHandle.dispose();
      const resolvedHandle = vm.unwrapResult(settled);
      const serialized = vm.getString(resolvedHandle);
      resolvedHandle.dispose();

      return {
        result: JSON.parse(serialized) as unknown,
        logs
      };
    } catch (error) {
      return {
        result: undefined,
        error: Date.now() > deadline ? `Execution timed out after ${this.timeoutMs}ms` : errorMessage(error),
        logs
      };
    } finally {
      vm.dispose();
      runtime.dispose();
    }
  }
}
