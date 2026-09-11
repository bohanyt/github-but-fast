import { createPrivateKey } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { GithubClientConfig } from "../github-client";

export interface LocalConfig extends GithubClientConfig {
  MCP_BEARER_TOKEN: string;
  GBF_PUBLIC_ORIGIN?: string;
  HOST: string;
  PORT: number;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function normalizePrivateKeyForJose(value: string): string {
  const normalized = value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
  if (normalized.includes("-----BEGIN PRIVATE KEY-----")) return normalized;

  try {
    return createPrivateKey(normalized)
      .export({ format: "pem", type: "pkcs8" })
      .toString();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`GITHUB private key is not a valid PEM private key: ${message}`);
  }
}

function privateKey(): string {
  const inline = process.env.GITHUB_PRIVATE_KEY;
  if (inline?.trim()) return normalizePrivateKeyForJose(inline);

  const file = required("GITHUB_PRIVATE_KEY_FILE");
  return normalizePrivateKeyForJose(readFileSync(resolve(file), "utf8"));
}

export function loadLocalConfig(): LocalConfig {
  const portRaw = process.env.GBF_PORT ?? "8787";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid GBF_PORT: ${portRaw}`);
  }

  return {
    GITHUB_APP_ID: required("GITHUB_APP_ID"),
    GITHUB_INSTALLATION_ID: required("GITHUB_INSTALLATION_ID"),
    GITHUB_PRIVATE_KEY: privateKey(),
    GITHUB_ALLOWED_REPOS: required("GITHUB_ALLOWED_REPOS"),
    GITHUB_RESPONSE_MAX_BYTES: process.env.GITHUB_RESPONSE_MAX_BYTES,
    MCP_BEARER_TOKEN: required("MCP_BEARER_TOKEN"),
    GBF_PUBLIC_ORIGIN: process.env.GBF_PUBLIC_ORIGIN?.trim() || undefined,
    HOST: process.env.GBF_HOST?.trim() || "127.0.0.1",
    PORT: port
  };
}
