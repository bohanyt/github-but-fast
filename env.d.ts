interface Env {
  LOADER: WorkerLoader;
  GITHUB_APP_ID: string;
  GITHUB_INSTALLATION_ID: string;
  GITHUB_PRIVATE_KEY: string;
  GITHUB_ALLOWED_REPOS: string;
  MCP_BEARER_TOKEN: string;
  GITHUB_RESPONSE_MAX_BYTES?: string;
}
