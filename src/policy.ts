const READ_METHODS = new Set(["GET", "HEAD"]);
const SEARCH_PREFIX = "/search/";
const REPOS_PREFIX = "/repos/";
const GITHUB_ORIGIN = "https://api.github.com";

export function parseAllowedRepos(raw: string): Set<string> {
  const repos = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (repos.length === 0) {
    throw new Error("GITHUB_ALLOWED_REPOS must contain at least one owner/repo entry");
  }

  for (const repo of repos) {
    if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
      throw new Error(`Invalid repository in GITHUB_ALLOWED_REPOS: ${repo}`);
    }
  }

  return new Set(repos);
}

function assertCanonicalGithubPath(path: string): void {
  if (!path.startsWith("/") || path.includes("?") || path.includes("#")) {
    throw new Error(`Read-only policy rejected non-canonical GitHub path ${path}`);
  }

  const resolved = new URL(path, GITHUB_ORIGIN);
  if (resolved.origin !== GITHUB_ORIGIN || resolved.pathname !== path) {
    throw new Error(`Read-only policy rejected non-canonical GitHub path ${path}`);
  }
}

function repoFromPath(path: string): string | null {
  if (!path.startsWith(REPOS_PREFIX)) return null;
  const [owner, repo] = path.slice(REPOS_PREFIX.length).split("/");
  if (!owner || !repo) return null;
  return `${decodeURIComponent(owner)}/${decodeURIComponent(repo)}`.toLowerCase();
}

function reposFromSearchQuery(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [...value.matchAll(/(?:^|\s)repo:([^\s]+)/gi)].map((match) =>
    match[1].toLowerCase()
  );
}

export function assertReadOnlyGithubRequest(input: {
  method: string;
  path: string;
  query?: Record<string, unknown>;
  allowedRepos: Set<string>;
}): void {
  const method = input.method.toUpperCase();
  if (!READ_METHODS.has(method)) {
    throw new Error(`Read-only policy rejected HTTP method ${method}`);
  }

  assertCanonicalGithubPath(input.path);

  const repo = repoFromPath(input.path);
  if (repo) {
    if (!input.allowedRepos.has(repo)) {
      throw new Error(`Repository ${repo} is not in GITHUB_ALLOWED_REPOS`);
    }
    return;
  }

  if (input.path.startsWith(SEARCH_PREFIX)) {
    const repos = reposFromSearchQuery(input.query?.q);
    if (repos.length === 0) {
      throw new Error("Search requests must include at least one repo:owner/name qualifier");
    }
    const outside = repos.find((candidate) => !input.allowedRepos.has(candidate));
    if (outside) {
      throw new Error(`Search repository ${outside} is not in GITHUB_ALLOWED_REPOS`);
    }
    return;
  }

  if (input.path === "/rate_limit") return;

  throw new Error(`Read-only policy rejected GitHub path ${input.path}`);
}

export function filterReadOnlyOpenApiSpec<T extends Record<string, unknown>>(spec: T): T {
  const paths = spec.paths;
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) {
    throw new Error("GitHub OpenAPI document has no paths object");
  }

  const nextPaths: Record<string, unknown> = {};

  for (const [path, rawItem] of Object.entries(paths)) {
    if (
      path !== "/rate_limit" &&
      !path.startsWith(REPOS_PREFIX) &&
      !path.startsWith(SEARCH_PREFIX)
    ) {
      continue;
    }
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) continue;

    const item = rawItem as Record<string, unknown>;
    const filtered: Record<string, unknown> = {};
    if (item.parameters) filtered.parameters = item.parameters;
    if (item.get) filtered.get = item.get;
    if (item.head) filtered.head = item.head;

    if (filtered.get || filtered.head) nextPaths[path] = filtered;
  }

  return { ...spec, paths: nextPaths };
}
