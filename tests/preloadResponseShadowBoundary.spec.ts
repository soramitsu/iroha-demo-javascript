import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const preload = readFileSync(resolve("electron/preload.ts"), "utf8");

const between = (startMarker: string, endMarker: string): string => {
  const start = preload.indexOf(startMarker);
  const end = preload.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return preload.slice(start, end);
};

describe("preload first-release response and shadow-state boundary", () => {
  it("never delegates active Torii JSON decoding to permissive Response helpers", () => {
    expect(preload).not.toMatch(/\bresponse\.(?:json|text)\s*\(/u);
    expect(preload).toContain("readBoundedJsonResponse(response");
    expect(preload).toContain("readBoundedJsonObjectResponse(response");
    expect(preload).toContain("readBoundedExactJsonTextResponse(");
    expect(preload).toContain('new TextDecoder("utf-8", { fatal: true })');
    expect(preload).toContain("parseStrictJson(text, label)");
    expect(preload).toContain("requireApplicationJson: true");
  });

  it("uses only exact versioned shadow schemas and deletes retired or invalid state", () => {
    const shadowBoundary = between(
      "const CONFIDENTIAL_WALLET_SHADOW_SCHEMA",
      "const deriveConfidentialWalletBackupKey",
    );

    expect(shadowBoundary).toContain(
      '"iroha-demo-confidential-wallet-shadow/v1"',
    );
    expect(shadowBoundary).toContain('"iroha-demo:confidential-wallet:v1"');
    expect(shadowBoundary).toContain("parseStrictJson(raw");
    expect(shadowBoundary).toContain("assertExactObjectKeys(");
    expect(shadowBoundary).toContain("JSON.stringify(state) !== raw");
    expect(shadowBoundary).toContain("deleteEndpointDerivedStateKeys(");
    expect(shadowBoundary).toContain("deleteInvalidCurrentShadowState(");
    expect(shadowBoundary).toContain("removeItem(key)");
    expect(shadowBoundary).toContain("FORBIDDEN_SHADOW_SECRET_FIELDS");
    expect(shadowBoundary).not.toContain("Partial<");
    expect(shadowBoundary).not.toContain("value.txHash");
    expect(shadowBoundary).not.toContain("value.entrypoint_hash");
    expect(shadowBoundary).not.toContain("value.created_at_ms");
    expect(preload).not.toContain("PRIVATE_KAIGI_SHADOW");
    expect(preload).not.toContain("iroha-demo-private-kaigi-xor-shadow");
    expect(preload).not.toContain("iroha-demo:private-kaigi-xor");
  });

  it("does not expose unused private-key derivation methods to the renderer", () => {
    expect(preload).not.toContain("deriveConfidentialOwnerTag(");
    expect(preload).not.toContain("deriveConfidentialReceiveAddress(");

    const setupAllowlist = between(
      "const SETUP_SECRET_INPUT_METHODS",
      "contextBridge.exposeInMainWorld",
    );
    expect(setupAllowlist).toContain('"storeAccountSecret"');
    expect(setupAllowlist).toContain('"derivePublicKey"');
    expect(setupAllowlist).not.toContain("deriveConfidential");
  });
});
