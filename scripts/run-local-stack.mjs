import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const envFile = join(root, ".env.local");
const cloudflared = join(root, "tools", process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
const tunnelName = process.env.GBF_TUNNEL_NAME?.trim() || "gbf";

if (!existsSync(envFile)) {
  throw new Error(`Missing ${envFile}`);
}
if (!existsSync(cloudflared)) {
  throw new Error(`Missing cloudflared binary at ${cloudflared}`);
}

const children = [];
let shuttingDown = false;

function start(command, args, label) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: false
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`${label} exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"}).`);
    shutdown(code ?? 1);
  });
  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(exitCode), 300).unref();
}

console.log("Starting GitHub But Fast local server + Cloudflare Tunnel...");
console.log(`Tunnel: ${tunnelName}`);
console.log("Press Ctrl+C once to stop both processes.");

start(
  process.execPath,
  ["--env-file=.env.local", "--import", "tsx", "src/local-server.ts"],
  "GBF server"
);
start(cloudflared, ["tunnel", "run", tunnelName], "cloudflared");

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
