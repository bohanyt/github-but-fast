import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizePrivateKeyForJose } from "../src/local/config";

describe("normalizePrivateKeyForJose", () => {
  it("converts PKCS#1 RSA PEM to PKCS#8 for jose", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 1024,
      privateKeyEncoding: { format: "pem", type: "pkcs1" },
      publicKeyEncoding: { format: "pem", type: "spki" }
    });

    const normalized = normalizePrivateKeyForJose(privateKey);
    expect(normalized).toContain("-----BEGIN PRIVATE KEY-----");
    expect(normalized).toContain("-----END PRIVATE KEY-----");
  });

  it("preserves PKCS#8 PEM", () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 1024,
      privateKeyEncoding: { format: "pem", type: "pkcs8" },
      publicKeyEncoding: { format: "pem", type: "spki" }
    });

    expect(normalizePrivateKeyForJose(privateKey)).toBe(privateKey);
  });
});
