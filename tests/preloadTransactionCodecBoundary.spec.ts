import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const preload = readFileSync(resolve("electron/preload.ts"), "utf8");
const nativeDir = readFileSync(resolve("electron/irohaJsNativeDir.ts"), "utf8");
const postinstall = readFileSync(
  resolve("scripts/postinstallNativeCheck.mjs"),
  "utf8",
);

const between = (source: string, startMarker: string, endMarker: string) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe("preload current transaction codec boundary", () => {
  it("accepts only exact canonical VersionedSignedTransaction V1 bytes", () => {
    const codec = between(
      preload,
      "const encodeSignedTransactionForPipeline",
      "const confidentialWalletShadowStateCache",
    );

    expect(codec).toContain("native.encodeSignedTransactionVersioned(input)");
    expect(codec).toContain("encoded.length === 0");
    expect(codec).toContain(
      "encoded[0] !== VERSIONED_TRANSACTION_PAYLOAD_VERSION",
    );
    expect(codec).toContain("!encoded.equals(input)");
    expect(codec).not.toContain("encodeSignedTransactionNorito");
    expect(codec).not.toContain("unwrapNrt0NoritoFrame");
    expect(codec).not.toContain("Buffer.concat");
  });

  it("fails closed on malformed pipeline receipts while preserving exact empty semantics", () => {
    const decoder = between(
      preload,
      "const readPipelineSubmissionResponse",
      "const submitSignedTransactionAsVersioned",
    );

    expect(decoder).toContain("response.status === 204");
    expect(decoder).toContain("readBoundedResponseBytes(response");
    expect(decoder).toContain("readBoundedJsonResponse(response");
    expect(decoder).toContain("requireApplicationJson: true");
    expect(decoder).toContain("allowEmpty: true");
    expect(decoder).toContain("decodeTransactionReceiptJson(body)");
    expect(decoder).toContain("does not expose decodeTransactionReceiptJson");
    expect(decoder).toContain("decoder returned invalid JSON");
    expect(decoder).not.toContain(".catch(() => null)");
  });

  it("submits every transaction through the native canonical V1 codec", () => {
    const submission = between(
      preload,
      "const submitSignedTransactionAsVersioned",
      "const fetchConfidentialAssetPolicy",
    );

    expect(submission).toContain("encodeSignedTransactionForPipeline(");
    expect(submission).toContain("nativeBinding: irohaNativeBinding");
    expect(submission).toContain('"/v1/pipeline/transactions"');
    expect(submission).toContain('redirect: "error"');
    expect(submission).not.toContain("getClient(");
    expect(submission).not.toContain("submitTransaction(");
    expect(submission).not.toContain("requireNativeEncoding");
  });

  it("requires every native export consumed by the active transaction path", () => {
    for (const exportName of [
      "encodeSignedTransactionVersioned",
      "decodeTransactionReceiptJson",
    ]) {
      expect(nativeDir).toContain(`"${exportName}"`);
      expect(postinstall).toContain(`"${exportName}"`);
    }
  });
});
