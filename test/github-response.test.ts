import { describe, expect, it } from "vitest";
import { normalizeGithubResponse } from "../src/github-response";

describe("normalizeGithubResponse", () => {
  it("decodes GitHub contents API base64 file responses to compact UTF-8 text", () => {
    const body = {
      type: "file",
      name: "AGENTS.md",
      path: "AGENTS.md",
      sha: "abc",
      size: 12,
      encoding: "base64",
      content: Buffer.from("hello\nworld\n", "utf8").toString("base64"),
      html_url: "https://github.com/example/repo/blob/main/AGENTS.md",
      download_url: "https://raw.githubusercontent.com/example/repo/main/AGENTS.md",
      _links: { self: "x", git: "y", html: "z" }
    };

    expect(normalizeGithubResponse("/repos/example/repo/contents/AGENTS.md", body)).toEqual({
      type: "file",
      name: "AGENTS.md",
      path: "AGENTS.md",
      sha: "abc",
      size: 12,
      encoding: "utf-8",
      content: "hello\nworld\n",
      html_url: "https://github.com/example/repo/blob/main/AGENTS.md"
    });
  });

  it("leaves directory listings unchanged", () => {
    const body = [{ type: "file", name: "a.txt", path: "a.txt" }];
    expect(normalizeGithubResponse("/repos/example/repo/contents", body)).toBe(body);
  });

  it("leaves non-contents responses unchanged", () => {
    const body = { full_name: "example/repo" };
    expect(normalizeGithubResponse("/repos/example/repo", body)).toBe(body);
  });
});
