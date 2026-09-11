import { describe, expect, it } from "vitest";
import {
  assertReadOnlyGithubRequest,
  filterReadOnlyOpenApiSpec,
  parseAllowedRepos
} from "../src/policy";

const allowed = new Set(["bohanyt/arti-dev", "bohanyt/github-but-fast"]);

describe("parseAllowedRepos", () => {
  it("normalizes and validates repositories", () => {
    expect([...parseAllowedRepos("BOHANYT/ARTI-DEV, bohanyt/github-but-fast")]).toEqual([
      "bohanyt/arti-dev",
      "bohanyt/github-but-fast"
    ]);
  });

  it("rejects an empty allowlist", () => {
    expect(() => parseAllowedRepos("  ")).toThrow(/at least one/);
  });
});

describe("assertReadOnlyGithubRequest", () => {
  it("allows a GET for an allowlisted repository", () => {
    expect(() =>
      assertReadOnlyGithubRequest({
        method: "GET",
        path: "/repos/bohanyt/arti-dev/issues/133/comments",
        allowedRepos: allowed
      })
    ).not.toThrow();
  });

  it("rejects mutations even inside an allowlisted repository", () => {
    expect(() =>
      assertReadOnlyGithubRequest({
        method: "POST",
        path: "/repos/bohanyt/arti-dev/issues/133/comments",
        allowedRepos: allowed
      })
    ).toThrow(/HTTP method POST/);
  });

  it("rejects repositories outside the allowlist", () => {
    expect(() =>
      assertReadOnlyGithubRequest({
        method: "GET",
        path: "/repos/other/private-repo/issues",
        allowedRepos: allowed
      })
    ).toThrow(/not in GITHUB_ALLOWED_REPOS/);
  });

  it("rejects dot-segment path escapes after an allowed repo prefix", () => {
    expect(() =>
      assertReadOnlyGithubRequest({
        method: "GET",
        path: "/repos/bohanyt/arti-dev/../../../user",
        allowedRepos: allowed
      })
    ).toThrow(/non-canonical GitHub path/);
  });

  it("rejects encoded dot-segment path escapes", () => {
    expect(() =>
      assertReadOnlyGithubRequest({
        method: "GET",
        path: "/repos/bohanyt/arti-dev/%2e%2e/%2e%2e/user",
        allowedRepos: allowed
      })
    ).toThrow(/non-canonical GitHub path/);
  });

  it("rejects protocol-relative host escapes", () => {
    expect(() =>
      assertReadOnlyGithubRequest({
        method: "GET",
        path: "//example.com/repos/bohanyt/arti-dev",
        allowedRepos: allowed
      })
    ).toThrow(/non-canonical GitHub path/);
  });

  it("requires repo scoping for search", () => {
    expect(() =>
      assertReadOnlyGithubRequest({
        method: "GET",
        path: "/search/code",
        query: { q: "NativeActionOwner" },
        allowedRepos: allowed
      })
    ).toThrow(/repo:owner\/name/);
  });

  it("allows search scoped only to allowed repositories", () => {
    expect(() =>
      assertReadOnlyGithubRequest({
        method: "GET",
        path: "/search/code",
        query: { q: "NativeActionOwner repo:bohanyt/arti-dev" },
        allowedRepos: allowed
      })
    ).not.toThrow();
  });
});

describe("filterReadOnlyOpenApiSpec", () => {
  it("keeps only repo/search/rate-limit GET/HEAD operations", () => {
    const spec = {
      openapi: "3.0.0",
      paths: {
        "/repos/{owner}/{repo}/issues": {
          get: { operationId: "issues/list" },
          post: { operationId: "issues/create" }
        },
        "/search/code": {
          get: { operationId: "search/code" }
        },
        "/rate_limit": {
          get: { operationId: "rate-limit/get" }
        },
        "/user": {
          get: { operationId: "users/get-authenticated" }
        }
      }
    };

    const filtered = filterReadOnlyOpenApiSpec(spec);
    expect(filtered.paths).toEqual({
      "/repos/{owner}/{repo}/issues": { get: { operationId: "issues/list" } },
      "/search/code": { get: { operationId: "search/code" } },
      "/rate_limit": { get: { operationId: "rate-limit/get" } }
    });
  });
});
