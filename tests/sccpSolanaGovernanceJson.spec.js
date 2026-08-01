// @vitest-environment node

import { createHash } from "node:crypto";
import { lstat, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseSolanaGovernanceCanonicalJsonBytes,
  parseSolanaGovernanceDeterministicJsonText,
  parseSolanaGovernanceDuplicateFreeJsonText,
} from "../scripts/e2e/sccp-solana-governance-json.mjs";
import { buildPinnedSolanaGovernancePlan } from "../scripts/sccp-solana-governance-plan.mjs";
import { runTairaSccpGovernance } from "../scripts/taira-sccp-route-governance.mjs";
import { SOLANA_TESTNET_RPC_URL } from "../scripts/e2e/sccp-solana-ordered-initialization.mjs";

const sha256 = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;

const malformedUtf8Json = Buffer.from([
  0x7b, 0x22, 0x61, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d, 0x0a,
]);

const ambiguousArtifacts = [
  {
    label: "duplicate keys",
    bytes: Buffer.from('{"route_id":"taira_sol_xor","route_id":"other"}\n'),
  },
  { label: "malformed UTF-8", bytes: malformedUtf8Json },
  {
    label: "noncanonical whitespace",
    bytes: Buffer.from(' {"route_id":"taira_sol_xor"}\n'),
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("irreversible Solana SCCP governance JSON", () => {
  it("accepts only deterministic writer encodings and duplicate-free response JSON", () => {
    expect(
      parseSolanaGovernanceCanonicalJsonBytes(
        Buffer.from('{"phase":"register"}\n'),
        "reviewed plan",
      ),
    ).toEqual({ phase: "register" });
    expect(
      parseSolanaGovernanceCanonicalJsonBytes(
        Buffer.from('{\n  "phase": "register"\n}\n'),
        "reviewed plan",
      ),
    ).toEqual({ phase: "register" });
    expect(
      parseSolanaGovernanceDuplicateFreeJsonText(
        '{"ok":true,"proposal_id":"reviewed"}',
        "governance draft response",
      ),
    ).toEqual({ ok: true, proposal_id: "reviewed" });
    expect(() =>
      parseSolanaGovernanceDuplicateFreeJsonText(
        '{"ok":true,"\\u006fk":false}',
        "governance draft response",
      ),
    ).toThrow(/duplicate-free JSON/u);
    expect(() =>
      parseSolanaGovernanceDeterministicJsonText(
        ' {"ok":true}',
        "governance draft response",
      ),
    ).toThrow(/deterministic duplicate-free JSON/u);
    expect(() =>
      parseSolanaGovernanceCanonicalJsonBytes(
        Buffer.from('{"slot":9007199254740992}\n'),
        "reviewed plan",
      ),
    ).toThrow(/canonical, duplicate-free UTF-8 JSON/u);
  });

  it.each(ambiguousArtifacts)(
    "rejects $label before a governance-plan output is created",
    async ({ bytes }) => {
      const directory = await mkdtemp(
        join(tmpdir(), "sccp-solana-governance-json-plan-"),
      );
      try {
        const routePath = join(directory, "route.json");
        const anchorPath = join(directory, "anchor.json");
        const orderedPath = join(directory, "ordered.json");
        const outputPath = join(directory, "plan.json");
        const validPlaceholder = Buffer.from("{}\n");
        await Promise.all([
          writeFile(routePath, bytes),
          writeFile(anchorPath, validPlaceholder),
          writeFile(orderedPath, validPlaceholder),
        ]);
        await expect(
          buildPinnedSolanaGovernancePlan({
            route: routePath,
            "expected-route-sha256": sha256(bytes),
            "native-trust-anchor": anchorPath,
            "expected-native-trust-anchor-sha256": sha256(validPlaceholder),
            "ordered-initialization-evidence": orderedPath,
            "expected-ordered-initialization-evidence-sha256":
              sha256(validPlaceholder),
            out: outputPath,
          }),
        ).rejects.toThrow(/canonical, duplicate-free UTF-8 JSON/u);
        await expect(lstat(outputPath)).rejects.toMatchObject({
          code: "ENOENT",
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

  it.each(ambiguousArtifacts)(
    "rejects $label before signer, RPC, submission, or result output use",
    async ({ bytes }) => {
      const directory = await mkdtemp(
        join(tmpdir(), "sccp-solana-governance-json-submit-"),
      );
      try {
        const planPath = join(directory, "plan.json");
        const orderedPath = join(directory, "ordered.json");
        const outputPath = join(directory, "result.json");
        const validPlaceholder = Buffer.from("{}\n");
        await Promise.all([
          writeFile(planPath, bytes),
          writeFile(orderedPath, validPlaceholder),
        ]);
        const fetchMock = vi.fn(async () => {
          throw new Error("RPC must not be used for ambiguous governance JSON");
        });
        vi.stubGlobal("fetch", fetchMock);
        await expect(
          runTairaSccpGovernance({
            plan: planPath,
            phase: "register",
            "expected-plan-sha256":
              "0x1111111111111111111111111111111111111111111111111111111111111111",
            "ordered-initialization-evidence": orderedPath,
            "expected-ordered-initialization-evidence-sha256":
              sha256(validPlaceholder),
            "torii-url": "https://taira-validator-1.sora.org",
            "solana-rpc-url": SOLANA_TESTNET_RPC_URL,
            out: outputPath,
            submit: "true",
          }),
        ).rejects.toThrow(/canonical, duplicate-free UTF-8 JSON/u);
        expect(fetchMock).not.toHaveBeenCalled();
        await expect(lstat(outputPath)).rejects.toMatchObject({
          code: "ENOENT",
        });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
