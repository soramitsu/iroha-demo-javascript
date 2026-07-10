import { spawnSync } from "node:child_process";
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canonicalTairaRouteManifestIsiSha256,
  parseTairaRouteManifestSubmitArgs,
  transactionStatusKind,
  validateTairaRouteManifestIsiArtifact,
  validateTairaRouteManifestSubmitEndpoints,
  writeTairaRouteManifestSubmissionJson,
} from "../scripts/taira-submit-upsert-sccp-route-manifest.mjs";
import { parseTairaMcpJsonRpcResponseText } from "../scripts/taira-mcp-json-rpc.mjs";

describe("TAIRA route manifest submit helper", () => {
  const canonicalArtifact = () => {
    const manifest = {
      route_id: "taira_sol_xor",
      asset_key: "xor",
      production_ready: true,
    };
    const manifestSha256 = canonicalTairaRouteManifestIsiSha256(manifest);
    return {
      schema: "iroha-sccp-route-manifest-isi/v1",
      routeId: "taira_sol_xor",
      assetKey: "xor",
      productionReady: true,
      instruction: { UpsertSccpRouteManifest: { manifest } },
      manifestSha256,
      instructionManifestSha256: manifestSha256,
    };
  };

  it("requires a single explicit allowlisted value for every CLI option", () => {
    expect(
      parseTairaRouteManifestSubmitArgs([
        "--isi",
        "route.json",
        "--authority",
        "test-account",
        "--out",
        "submission.json",
      ]),
    ).toMatchObject({
      isi: "route.json",
      authority: "test-account",
      out: "submission.json",
    });
    for (const argv of [
      ["secret-positional-token"],
      ["--secret-token-option", "value"],
      ["--isi"],
      ["--isi", "one", "--isi", "two"],
    ]) {
      expect(() => parseTairaRouteManifestSubmitArgs(argv)).toThrow();
      try {
        parseTairaRouteManifestSubmitArgs(argv);
      } catch (error) {
        expect(String(error)).not.toContain("secret-positional-token");
        expect(String(error)).not.toContain("secret-token-option");
      }
    }
  });

  it("accepts only a matching canonical TAIRA validator root and MCP endpoint", () => {
    expect(
      validateTairaRouteManifestSubmitEndpoints({
        toriiUrl: "https://taira-validator-1.sora.org",
        mcpUrl: "https://taira-validator-1.sora.org/v1/mcp",
      }),
    ).toEqual({
      toriiUrl: "https://taira-validator-1.sora.org",
      mcpUrl: "https://taira-validator-1.sora.org/v1/mcp",
    });
    for (const endpoints of [
      {
        toriiUrl: "https://taira.sora.org",
        mcpUrl: "https://taira.sora.org/v1/mcp",
      },
      {
        toriiUrl: "http://127.0.0.1:8080",
        mcpUrl: "http://127.0.0.1:8080/v1/mcp",
      },
      {
        toriiUrl: "https://taira-validator-1.sora.org",
        mcpUrl: "https://taira-validator-2.sora.org/v1/mcp",
      },
      {
        toriiUrl: "https://user:secret@taira-validator-1.sora.org",
        mcpUrl: "https://taira-validator-1.sora.org/v1/mcp",
      },
    ]) {
      expect(() =>
        validateTairaRouteManifestSubmitEndpoints(endpoints),
      ).toThrow(/canonical validator HTTPS root/u);
    }
  });

  it("binds the exact canonical route ISI object and embedded manifest hashes", () => {
    const artifact = canonicalArtifact();
    const expectedSha256 = canonicalTairaRouteManifestIsiSha256(artifact);
    expect(
      validateTairaRouteManifestIsiArtifact({ artifact, expectedSha256 }),
    ).toMatchObject({
      instruction: artifact.instruction,
      manifest: artifact.instruction.UpsertSccpRouteManifest.manifest,
      actualSha256: expectedSha256,
    });

    const substituted = structuredClone(artifact);
    substituted.instruction.UpsertSccpRouteManifest.manifest.route_id =
      "taira_bsc_xor";
    expect(() =>
      validateTairaRouteManifestIsiArtifact({
        artifact: substituted,
        expectedSha256,
      }),
    ).toThrow(/no longer matches/u);
    expect(() =>
      validateTairaRouteManifestIsiArtifact({
        artifact: substituted,
        expectedSha256: canonicalTairaRouteManifestIsiSha256(substituted),
      }),
    ).toThrow(/Embedded route manifest identity/u);

    const rehashedOuterOnly = structuredClone(artifact);
    rehashedOuterOnly.instruction.UpsertSccpRouteManifest.manifest.extra = true;
    expect(() =>
      validateTairaRouteManifestIsiArtifact({
        artifact: rehashedOuterOnly,
        expectedSha256: canonicalTairaRouteManifestIsiSha256(rehashedOuterOnly),
      }),
    ).toThrow(/manifest hash pins/u);
  });

  it.each([
    undefined,
    "0x",
    `0x${"AA".repeat(32)}`,
    `0x${"00".repeat(31)}`,
    `0x${"00".repeat(32)}`,
    `0x${"aa".repeat(32)}`,
  ])("rejects a non-canonical expected ISI hash %j", (expectedSha256) => {
    expect(() =>
      validateTairaRouteManifestIsiArtifact({
        artifact: canonicalArtifact(),
        expectedSha256,
      }),
    ).toThrow(/canonical lowercase SHA-256/u);
  });

  it("rejects a symlinked ISI before reading runtime signing material", () => {
    const root = mkdtempSync(path.join(tmpdir(), "taira-route-isi-link-"));
    const target = path.join(root, "target.json");
    const link = path.join(root, "secret-token-route.json");
    const output = path.join(root, "submission.json");
    const artifact = canonicalArtifact();
    writeFileSync(target, `${JSON.stringify(artifact)}\n`);
    symlinkSync(target, link);
    const result = spawnSync(
      process.execPath,
      [
        "scripts/taira-submit-upsert-sccp-route-manifest.mjs",
        "--isi",
        link,
        "--authority",
        "test-account",
        "--out",
        output,
        "--expected-isi-sha256",
        canonicalTairaRouteManifestIsiSha256(artifact),
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY: "do-not-read-this-secret",
        },
      },
    );
    try {
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toMatch(
        /failed to read route manifest ISI artifact/u,
      );
      expect(`${result.stdout}${result.stderr}`).not.toContain(
        "secret-token-route",
      );
      expect(`${result.stdout}${result.stderr}`).not.toContain(
        "do-not-read-this-secret",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("atomically replaces a hostile output symlink without following it", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "taira-route-out-link-"));
    const target = path.join(root, "unrelated.json");
    const output = path.join(root, "submission.json");
    writeFileSync(target, "operator-owned\n", { mode: 0o600 });
    symlinkSync(target, output);
    try {
      await writeTairaRouteManifestSubmissionJson(output, {
        schema: "safe-submission",
      });
      expect(readFileSync(target, "utf8")).toBe("operator-owned\n");
      expect(lstatSync(output).isFile()).toBe(true);
      expect(lstatSync(output).isSymbolicLink()).toBe(false);
      expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({
        schema: "safe-submission",
      });
      expect(
        readdirSync(root).filter((name) => name.includes(".tmp-")),
      ).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("parses plain JSON and SSE MCP JSON-RPC responses", () => {
    expect(
      parseTairaMcpJsonRpcResponseText(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }),
      ),
    ).toEqual({ jsonrpc: "2.0", id: 1, result: { ok: true } });

    expect(
      parseTairaMcpJsonRpcResponseText(
        [
          ": keepalive",
          "event: message",
          `data: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } })}`,
          "",
          "data: [DONE]",
          "",
        ].join("\n"),
      ),
    ).toEqual({ jsonrpc: "2.0", id: 1, result: { ok: true } });
  });

  it("rejects malformed MCP response text", () => {
    expect(() => parseTairaMcpJsonRpcResponseText("event: ping\n\n")).toThrow(
      "MCP response was neither JSON nor SSE data.",
    );
    expect(() =>
      parseTairaMcpJsonRpcResponseText('data: {"jsonrpc":"2.0"\n\n'),
    ).toThrow();
  });

  it("extracts pipeline status from MCP route-dispatched tool receipts", () => {
    expect(
      transactionStatusKind({
        structuredContent: {
          status: 200,
          body: {
            status: {
              kind: "Applied",
            },
          },
        },
      }),
    ).toBe("Applied");

    expect(
      transactionStatusKind({
        body: JSON.stringify({
          content: {
            status: {
              kind: "Rejected",
            },
          },
        }),
      }),
    ).toBe("Rejected");

    expect(
      transactionStatusKind({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              status: {
                kind: "Expired",
              },
            }),
          },
        ],
      }),
    ).toBe("Expired");
  });

  it("does not infer Applied from ambiguous MCP receipts", () => {
    const cyclic = {};
    cyclic.body = cyclic;

    expect(transactionStatusKind({ status: 200, body: { ok: true } })).toBe(
      null,
    );
    expect(transactionStatusKind({ kind: "NotAStatus" })).toBe(null);
    expect(transactionStatusKind(cyclic)).toBe(null);
  });
});
