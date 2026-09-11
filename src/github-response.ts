const CONTENTS_PATH_RE = /^\/repos\/[^/]+\/[^/]+\/contents(?:\/.*)?$/;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function decodeBase64Utf8(value: string): string {
  return Buffer.from(value.replace(/\s+/g, ""), "base64").toString("utf8");
}

export function normalizeGithubResponse(path: string, body: unknown): unknown {
  if (!CONTENTS_PATH_RE.test(path) || !isRecord(body)) return body;
  if (body.type !== "file" || body.encoding !== "base64" || typeof body.content !== "string") {
    return body;
  }

  return {
    type: body.type,
    name: body.name,
    path: body.path,
    sha: body.sha,
    size: body.size,
    encoding: "utf-8",
    content: decodeBase64Utf8(body.content),
    html_url: body.html_url ?? null
  };
}
