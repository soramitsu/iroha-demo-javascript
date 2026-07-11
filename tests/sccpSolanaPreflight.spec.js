/* global BigInt */
import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertSolanaManifestSetEnvelope,
  checkProverModules,
  checkSolanaRpc,
  checkDestinationProofAdmission,
  checkManifestShape,
  checkProductionReadyFlag,
  checkSolanaLanePublication,
  checkLiveSolanaBridgeProgramPins,
  checkSolanaRouteInstancePublication,
  checkSourceLaneMaterial,
  fetchJson,
  mergeSolanaLaneManifestEvidence,
  pickSolanaCapability,
  pickSolanaLaneManifest,
  pickSolanaRouteManifest,
  parseSccpSolanaVerifierStateData,
  parseSplTokenMintAccountData,
  parseUpgradeableProgramDataAccountData,
  readBooleanArg,
  runSccpSolanaRoutePreflight,
  solanaRouteManifestCanonicalSha256,
  solanaExecutableBlake2b256,
  SOLANA_DESTINATION_PROOF_BACKEND,
  SOLANA_DESTINATION_VERIFIER_PLAN,
  SOLANA_SOURCE_ADAPTER_CIRCUIT_ID,
  SOLANA_SOURCE_ADAPTER_PROOF_FAMILY,
  SOLANA_SOURCE_FINALITY_MODEL,
  SOLANA_SOURCE_PROOF_BACKEND,
  SOLANA_SOURCE_PROOF_PLAN,
  SOLANA_TESTNET_SOURCE_PROFILE,
  SOLANA_TESTNET_NETWORK_ID,
  SOLANA_TESTNET_GENESIS_HASH,
  SOLANA_VERIFIER_TARGET,
  summarizeSolanaLaneManifest,
  SOLANA_PROGRAMDATA_METADATA_LEN,
  SCCP_SOLANA_STATE_LEN,
  SCCP_SOLANA_STATE_MAGIC,
  SOLANA_UPGRADEABLE_PROGRAMDATA_TAG,
} from "../scripts/e2e/sccp-solana-route-preflight.mjs";

const destinationProverProfile = Object.freeze({
  proofBackend: SOLANA_DESTINATION_PROOF_BACKEND,
  requiredProofBackend: SOLANA_DESTINATION_PROOF_BACKEND,
  genesisHash: SOLANA_TESTNET_GENESIS_HASH,
  destinationVerifierPlan: SOLANA_DESTINATION_VERIFIER_PLAN,
  verifierTarget: SOLANA_VERIFIER_TARGET,
});

const sourceProverProfile = Object.freeze({
  proofBackend: SOLANA_SOURCE_PROOF_BACKEND,
  requiredProofBackend: SOLANA_SOURCE_PROOF_BACKEND,
  genesisHash: SOLANA_TESTNET_GENESIS_HASH,
});

const canonicalSolanaLaneRecord = (overrides = {}) => ({
  version: 1,
  local_domain: 0,
  local_chain: "sora",
  counterparty_domain: 3,
  chain: "sol",
  counterparty_account_codec: 3,
  counterparty_account_codec_key: "solana_base58",
  verifier_target: SOLANA_VERIFIER_TARGET,
  production_ready: false,
  ...overrides,
});

const canonicalSolanaRouteRecord = (overrides = {}) => ({
  route_id: "taira_sol_xor",
  asset_key: "xor",
  counterparty_domain: 3,
  chain: SOLANA_TESTNET_NETWORK_ID,
  solana_network: "testnet",
  network_id: SOLANA_TESTNET_NETWORK_ID,
  counterparty_account_codec: 3,
  counterparty_account_codec_key: "solana_base58",
  verifier_target: SOLANA_VERIFIER_TARGET,
  destination_verifier_plan: SOLANA_DESTINATION_VERIFIER_PLAN,
  solana_genesis_hash: SOLANA_TESTNET_GENESIS_HASH,
  production_ready: false,
  ...overrides,
});

describe("Solana route manifest canonical hash", () => {
  it("is recursively key-order independent and changes with semantics", () => {
    const manifest = canonicalSolanaRouteRecord({
      nested_review: { beta: 2, alpha: { two: 2, one: 1 } },
    });
    const reordered = Object.fromEntries(
      Object.entries(manifest)
        .reverse()
        .map(([key, value]) => [
          key,
          key === "nested_review"
            ? { alpha: { one: 1, two: 2 }, beta: 2 }
            : value,
        ]),
    );
    const expected = solanaRouteManifestCanonicalSha256(manifest);
    expect(solanaRouteManifestCanonicalSha256(reordered)).toBe(expected);
    expect(
      solanaRouteManifestCanonicalSha256({
        ...manifest,
        nested_review: { beta: 3, alpha: { two: 2, one: 1 } },
      }),
    ).not.toBe(expected);
    expect(checkManifestShape(manifest)).toMatchObject({
      manifestCanonicalSha256: expected,
    });
  });

  it("rejects malformed or ambiguous manifest response envelopes", () => {
    for (const value of [
      {},
      { manifests: {} },
      { routes: [null] },
      "not-json-object",
    ]) {
      expect(() => assertSolanaManifestSetEnvelope(value)).toThrow();
    }
    expect(() =>
      assertSolanaManifestSetEnvelope({ manifests: [], routes: [] }),
    ).not.toThrow();
  });
});

const leU32 = (value) => {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value, 0);
  return out;
};

const leU64 = (value) => {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value), 0);
  return out;
};

const exactBridgePinManifest = () => ({
  solanaBridgeProgramId: "J72TNLJweK8veYwbtHhtFdx4sk885Xx3QNZfL15zdHjD",
  solana_bridge_program_id: "J72TNLJweK8veYwbtHhtFdx4sk885Xx3QNZfL15zdHjD",
  solanaBridgeProgramdataAddress:
    "9ey7piM5hZap475XPFyMvfybLjZvA5QydwF6MAvDCRQp",
  solana_bridge_programdata_address:
    "9ey7piM5hZap475XPFyMvfybLjZvA5QydwF6MAvDCRQp",
  solanaBridgeProgramdataSlot: "420442737",
  solana_bridge_programdata_slot: "420442737",
  solanaBridgeCodeHash: `0x${"ab".repeat(32)}`,
  solana_bridge_code_hash: `0x${"ab".repeat(32)}`,
  sccpSolanaSourceBridgeAddress: "H6VxqBzD7ckUiDw9dvL57YaBmNgEFJXRYoUT8W8CFzr2",
  solana_source_bridge_program_id:
    "H6VxqBzD7ckUiDw9dvL57YaBmNgEFJXRYoUT8W8CFzr2",
  solanaSourceBridgeProgramdataAddress:
    "2ALmgF4o71uEXBXeQ56h2jeUb1VJrw5zvEo1QKjeZzP2",
  solana_source_bridge_programdata_address:
    "2ALmgF4o71uEXBXeQ56h2jeUb1VJrw5zvEo1QKjeZzP2",
  solanaSourceBridgeProgramdataSlot: "420442738",
  solana_source_bridge_programdata_slot: "420442738",
  solanaSourceBridgeCodeHash: `0x${"cd".repeat(32)}`,
  solana_source_bridge_code_hash: `0x${"cd".repeat(32)}`,
});

const exactBridgeLiveEvidence = (role) => {
  const source = role === "sourceBridge";
  return {
    programAddress: source
      ? "H6VxqBzD7ckUiDw9dvL57YaBmNgEFJXRYoUT8W8CFzr2"
      : "J72TNLJweK8veYwbtHhtFdx4sk885Xx3QNZfL15zdHjD",
    programdataAddress: source
      ? "2ALmgF4o71uEXBXeQ56h2jeUb1VJrw5zvEo1QKjeZzP2"
      : "9ey7piM5hZap475XPFyMvfybLjZvA5QydwF6MAvDCRQp",
    programdataSlot: source ? "420442738" : "420442737",
    programCodeHash: source ? `0x${"cd".repeat(32)}` : `0x${"ab".repeat(32)}`,
    immutable: true,
    upgradeAuthority: null,
    programContextSlot: 500,
    programdataContextSlot: 500,
  };
};

describe("Solana bridge live governance-pin acceptance", () => {
  it("requires exact destination and source ProgramData, slot, and code pins", () => {
    const manifest = exactBridgePinManifest();
    expect(
      checkLiveSolanaBridgeProgramPins(
        manifest,
        "destinationBridge",
        exactBridgeLiveEvidence("destinationBridge"),
      ),
    ).toMatchObject({ role: "destinationBridge", immutable: true });
    expect(
      checkLiveSolanaBridgeProgramPins(
        manifest,
        "sourceBridge",
        exactBridgeLiveEvidence("sourceBridge"),
      ),
    ).toMatchObject({ role: "sourceBridge", immutable: true });
  });

  it.each([
    [
      "program",
      (evidence) => (evidence.programAddress = evidence.programdataAddress),
    ],
    [
      "ProgramData",
      (evidence) => (evidence.programdataAddress = evidence.programAddress),
    ],
    ["slot", (evidence) => (evidence.programdataSlot = "420442736")],
    ["code", (evidence) => (evidence.programCodeHash = `0x${"ef".repeat(32)}`)],
    ["mutability", (evidence) => (evidence.immutable = false)],
    ["freshness", (evidence) => (evidence.programdataContextSlot = 0)],
  ])("rejects destination bridge %s drift", (_field, mutate) => {
    const evidence = exactBridgeLiveEvidence("destinationBridge");
    mutate(evidence);
    expect(() =>
      checkLiveSolanaBridgeProgramPins(
        exactBridgePinManifest(),
        "destinationBridge",
        evidence,
      ),
    ).toThrow();
  });

  it("rejects source/destination role swaps and manifest alias conflicts", () => {
    expect(() =>
      checkLiveSolanaBridgeProgramPins(
        exactBridgePinManifest(),
        "destinationBridge",
        exactBridgeLiveEvidence("sourceBridge"),
      ),
    ).toThrow(/program address/u);
    const manifest = exactBridgePinManifest();
    manifest.solana_bridge_programdata_slot = "420442739";
    expect(() =>
      checkLiveSolanaBridgeProgramPins(
        manifest,
        "destinationBridge",
        exactBridgeLiveEvidence("destinationBridge"),
      ),
    ).toThrow(/aliases must agree/u);
  });
});

describe("Solana SCCP preflight live ProgramData parsing", () => {
  it("honors allow-incomplete style boolean CLI values", () => {
    expect(readBooleanArg("true")).toBe(true);
    expect(readBooleanArg(true)).toBe(true);
    expect(readBooleanArg("false")).toBe(false);
    expect(readBooleanArg(undefined)).toBe(false);
  });

  it("bounds stalled HTTP reads during live preflight", async () => {
    const server = createServer((_request, response) => {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
      }, 200);
    });
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "localhost", resolve);
      });
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;

      await expect(
        fetchJson(`http://localhost:${port}`, {
          attempts: 1,
          timeoutMs: 20,
        }),
      ).rejects.toThrow(/timed out after 20ms/u);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("binds Solana RPC health to the canonical testnet genesis", async () => {
    let genesisHash = SOLANA_TESTNET_GENESIS_HASH;
    const methods = [];
    const server = createServer(async (request, response) => {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(chunk);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      methods.push(payload.method);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: payload.id,
          result: payload.method === "getHealth" ? "ok" : genesisHash,
        }),
      );
    });
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "localhost", resolve);
      });
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const rpcUrl = `http://localhost:${port}`;

      await expect(checkSolanaRpc(rpcUrl, { attempts: 1 })).resolves.toEqual({
        result: "ok",
        genesisHash: SOLANA_TESTNET_GENESIS_HASH,
      });
      expect(methods).toEqual(["getHealth", "getGenesisHash"]);

      genesisHash = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
      await expect(checkSolanaRpc(rpcUrl, { attempts: 1 })).rejects.toThrow(
        `must be ${SOLANA_TESTNET_GENESIS_HASH}`,
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("applies runner fetch timeout options to TAIRA preflight reads", async () => {
    const server = createServer((_request, response) => {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
      }, 200);
    });
    const tempDir = await mkdtemp(
      path.join(tmpdir(), "sccp-solana-preflight-timeout-"),
    );
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "localhost", resolve);
      });
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const manifestFile = path.join(tempDir, "manifest-set.json");
      await writeFile(
        manifestFile,
        `${JSON.stringify({ manifests: [], routes: [] })}\n`,
      );

      const { report } = await runSccpSolanaRoutePreflight({
        toriiUrl: `http://localhost:${port}`,
        manifestFile,
        outputDir: tempDir,
        fetchTimeoutMs: 20,
        fetchAttempts: 1,
        skipSolanaRpc: true,
      });
      const checks = new Map(report.checks.map((check) => [check.id, check]));

      expect(report.ready).toBe(false);
      expect(report.failedCheckIds).toEqual(
        expect.arrayContaining([
          "sccp-capabilities-load",
          "sccp-submit-capabilities",
          "solana-capability-publication",
          "solana-lane-publication",
        ]),
      );
      expect(report.blockerIds).toEqual(report.failedCheckIds);
      expect(checks.get("sccp-capabilities-load")).toMatchObject({
        status: "fail",
        detail: expect.stringMatching(/timed out after 20ms/u),
      });
      expect(checks.get("sccp-submit-capabilities")).toMatchObject({
        status: "fail",
        detail: expect.stringContaining(
          "Cannot validate SCCP submit capabilities because capabilities load failed",
        ),
      });
      expect(checks.get("solana-capability-publication")).toMatchObject({
        status: "fail",
        detail: expect.stringContaining(
          "Cannot determine Solana SCCP capability lane because capabilities load failed",
        ),
      });
      expect(checks.get("solana-lane-publication")).toMatchObject({
        status: "fail",
        detail: expect.stringContaining(
          "Cannot determine public Solana SCCP lane because capabilities load failed",
        ),
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("reports public Solana route publication as indeterminate when manifest reads time out", async () => {
    const server = createServer((request, response) => {
      if (request.url === "/v1/sccp/capabilities") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            proofSubmitPath: "/v1/sccp/proofs",
            messageSubmitPath: "/v1/sccp/messages",
            counterparties: [
              {
                domain: 3,
                chain: "sol",
                counterparty_account_codec: 3,
                counterparty_account_codec_key: "solana_base58",
                production_ready: true,
              },
            ],
          }),
        );
        return;
      }
      if (request.url === "/v1/sccp/manifests") {
        setTimeout(() => {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(JSON.stringify({ manifests: [], routes: [] }));
        }, 200);
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const tempDir = await mkdtemp(
      path.join(tmpdir(), "sccp-solana-preflight-manifest-timeout-"),
    );
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "localhost", resolve);
      });
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;

      const { report } = await runSccpSolanaRoutePreflight({
        toriiUrl: `http://localhost:${port}`,
        outputDir: tempDir,
        fetchTimeoutMs: 20,
        fetchAttempts: 1,
        skipSolanaRpc: true,
      });
      const checks = new Map(report.checks.map((check) => [check.id, check]));

      expect(report.ready).toBe(false);
      expect(report.failedCheckIds).toEqual(
        expect.arrayContaining([
          "sccp-manifest-load",
          "public-route-publication",
          "solana-route-instance-publication",
          "route-manifest-shape",
          "production-ready-flag",
          "browser-proof-modules",
        ]),
      );
      expect(report.blockerIds).toEqual(report.failedCheckIds);
      expect(checks.get("sccp-manifest-load")).toMatchObject({
        status: "fail",
        detail: expect.stringMatching(/timed out after 20ms/u),
      });
      expect(checks.get("public-route-publication")).toMatchObject({
        status: "fail",
        detail: expect.stringContaining(
          "Public TAIRA route publication cannot be proven because manifest load failed",
        ),
      });
      expect(checks.get("solana-route-instance-publication")).toMatchObject({
        status: "fail",
        detail: expect.stringContaining(
          "Cannot determine taira_sol_xor Solana route publication because manifest load failed",
        ),
      });
      expect(checks.get("route-manifest-shape")).toMatchObject({
        status: "fail",
        detail: expect.stringContaining(
          "Cannot validate taira_sol_xor Solana route manifest shape because manifest load failed",
        ),
      });
      expect(checks.get("production-ready-flag")).toMatchObject({
        status: "fail",
        detail: expect.stringContaining(
          "Cannot validate taira_sol_xor Solana production flag because manifest load failed",
        ),
      });
      expect(checks.get("browser-proof-modules")).toMatchObject({
        status: "fail",
        detail: expect.stringContaining(
          "Cannot validate Solana browser proof modules because manifest load failed",
        ),
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("accepts immutable ProgramData with retained trailing authority bytes", () => {
    const slot = 419725105n;
    const staleAuthority = Buffer.from(
      "c4f2feefb3ccdacce6859d6302876c2ea14084081193d57133ba6b6cef08d5aa",
      "hex",
    );
    const executable = Buffer.from("7f454c460102030405", "hex");
    const programdata = Buffer.concat([
      leU32(SOLANA_UPGRADEABLE_PROGRAMDATA_TAG),
      leU64(slot),
      Buffer.from([0]),
      staleAuthority,
      executable,
    ]);

    const parsed = parseUpgradeableProgramDataAccountData(programdata);

    expect(programdata.subarray(0, SOLANA_PROGRAMDATA_METADATA_LEN)).toEqual(
      Buffer.concat([
        leU32(SOLANA_UPGRADEABLE_PROGRAMDATA_TAG),
        leU64(slot),
        Buffer.from([0]),
        staleAuthority,
      ]),
    );
    expect(parsed.slot).toBe(slot.toString());
    expect(parsed.executableHash).toBe(solanaExecutableBlake2b256(executable));
    expect(parsed.executableLength).toBe(executable.length);
  });

  it("rejects mutable ProgramData even when the executable is otherwise valid", () => {
    const mutableProgramdata = Buffer.concat([
      leU32(SOLANA_UPGRADEABLE_PROGRAMDATA_TAG),
      leU64(419725105n),
      Buffer.from([1]),
      Buffer.from("11".repeat(32), "hex"),
      Buffer.from("7f454c460102030405", "hex"),
    ]);

    expect(() =>
      parseUpgradeableProgramDataAccountData(mutableProgramdata),
    ).toThrow("Solana ProgramData account must be immutable.");
  });

  it("parses PDA-controlled SPL mint and initialized SCCP verifier state", () => {
    const mintAuthority = Buffer.from("11".repeat(32), "hex");
    const mint = Buffer.alloc(82);
    leU32(1).copy(mint, 0);
    mintAuthority.copy(mint, 4);
    leU64(123n).copy(mint, 36);
    mint[44] = 9;
    mint[45] = 1;
    leU32(0).copy(mint, 46);

    const parsedMint = parseSplTokenMintAccountData(mint);

    expect(parsedMint.mintAuthority).toBe(
      "29d2S7vB453rNYFdR5Ycwt7y9haRT5fwVwL9zTmBhfV2",
    );
    expect(parsedMint.supply).toBe("123");
    expect(parsedMint.decimals).toBe(9);
    expect(parsedMint.initialized).toBe(true);
    expect(parsedMint.freezeAuthority).toBeNull();

    const state = Buffer.alloc(SCCP_SOLANA_STATE_LEN);
    Buffer.from(SCCP_SOLANA_STATE_MAGIC, "ascii").copy(state, 0);
    state[8] = 1;
    Buffer.from("22".repeat(32), "hex").copy(state, 16);
    mintAuthority.copy(state, 192);
    leU64(5n).copy(state, 224);
    leU64(3n).copy(state, 232);

    const parsedState = parseSccpSolanaVerifierStateData(state);

    expect(parsedState.magic).toBe(SCCP_SOLANA_STATE_MAGIC);
    expect(parsedState.version).toBe(1);
    expect(parsedState.storedMint).toBe(
      "29d2S7vB453rNYFdR5Ycwt7y9haRT5fwVwL9zTmBhfV2",
    );
    expect(parsedState.totalMinted).toBe("5");
    expect(parsedState.totalBurned).toBe("3");
    expect(parsedState.acceptedHash).toBeNull();
  });

  it("rejects shape-only Solana destination proof admission material", () => {
    const manifest = {
      verifierCodeHash: `0x${"11".repeat(32)}`,
      verifierKeyHash: `0x${"22".repeat(32)}`,
      destinationBindingHash: `0x${"33".repeat(32)}`,
      destinationProofAdmission: {
        admissionMode: "envelope-recorder-v1",
        proofSystem: "none",
        entrypoint: "submit_sccp_message_proof",
        verifierCodeHash: `0x${"11".repeat(32)}`,
        verifierKeyHash: `0x${"22".repeat(32)}`,
        destinationBindingHash: `0x${"33".repeat(32)}`,
        shapeOnly: true,
        acceptsUnverifiedProofs: true,
      },
      solanaProgramdataAddress: "2wen6hXkK13qnjfActBxfUxiGw1ASnUMrtqoNPMva7A7",
      solanaProgramdataSlot: 419725105,
    };

    expect(() => checkDestinationProofAdmission(manifest)).toThrow(
      /governed-zk-verifier-v1/u,
    );

    const production = {
      ...manifest,
      destinationProofAdmission: {
        ...manifest.destinationProofAdmission,
        admissionMode: "governed-zk-verifier-v1",
        proofSystem: "stark-fri-v1",
        shapeOnly: false,
        acceptsUnverifiedProofs: false,
      },
    };

    expect(checkDestinationProofAdmission(production)).toMatchObject({
      admissionMode: "governed-zk-verifier-v1",
      proofSystem: "stark-fri-v1",
      entrypoint: "submit_sccp_message_proof",
      verifierCodeHash: `0x${"11".repeat(32)}`,
      verifierKeyHash: `0x${"22".repeat(32)}`,
      destinationBindingHash: `0x${"33".repeat(32)}`,
    });
  });

  it("rejects conflicting Solana destination proof admission aliases", () => {
    const production = {
      verifierCodeHash: `0x${"11".repeat(32)}`,
      verifierKeyHash: `0x${"22".repeat(32)}`,
      destinationBindingHash: `0x${"33".repeat(32)}`,
      destinationProofAdmission: {
        admissionMode: "governed-zk-verifier-v1",
        proofSystem: "stark-fri-v1",
        entrypoint: "submit_sccp_message_proof",
        verifierCodeHash: `0x${"11".repeat(32)}`,
        verifierKeyHash: `0x${"22".repeat(32)}`,
        destinationBindingHash: `0x${"33".repeat(32)}`,
        shapeOnly: false,
        envelopeOnly: false,
        acceptsUnverifiedProofs: false,
      },
      solanaProgramdataAddress: "2wen6hXkK13qnjfActBxfUxiGw1ASnUMrtqoNPMva7A7",
      solanaProgramdataSlot: 419725105,
    };

    expect(() =>
      checkDestinationProofAdmission({
        ...production,
        destinationProofAdmission: {
          ...production.destinationProofAdmission,
          admission_mode: "envelope-recorder-v1",
        },
      }),
    ).toThrow(
      "Solana destination proof admission admissionMode aliases must agree",
    );
    expect(() =>
      checkDestinationProofAdmission({
        ...production,
        destinationProofAdmission: {
          ...production.destinationProofAdmission,
          verifier_code_hash: `0x${"44".repeat(32)}`,
        },
      }),
    ).toThrow(
      "Solana destination proof admission verifierCodeHash aliases must agree",
    );
  });

  it("rejects hidden true Solana destination proof admission flags", () => {
    const production = {
      verifierCodeHash: `0x${"11".repeat(32)}`,
      verifierKeyHash: `0x${"22".repeat(32)}`,
      destinationBindingHash: `0x${"33".repeat(32)}`,
      destinationProofAdmission: {
        admissionMode: "governed-zk-verifier-v1",
        proofSystem: "stark-fri-v1",
        entrypoint: "submit_sccp_message_proof",
        verifierCodeHash: `0x${"11".repeat(32)}`,
        verifierKeyHash: `0x${"22".repeat(32)}`,
        destinationBindingHash: `0x${"33".repeat(32)}`,
        shapeOnly: false,
        envelopeOnly: false,
        acceptsUnverifiedProofs: false,
      },
      solanaProgramdataAddress: "2wen6hXkK13qnjfActBxfUxiGw1ASnUMrtqoNPMva7A7",
      solanaProgramdataSlot: 419725105,
    };

    expect(() =>
      checkDestinationProofAdmission({
        ...production,
        destinationProofAdmission: {
          ...production.destinationProofAdmission,
          shape_only: true,
        },
      }),
    ).toThrow(
      "Solana destination proof admission shapeOnly must be false for production.",
    );
    expect(() =>
      checkDestinationProofAdmission({
        ...production,
        destinationProofAdmission: {
          ...production.destinationProofAdmission,
          accepts_unverified_proofs: "true",
        },
      }),
    ).toThrow(
      "Solana destination proof admission acceptsUnverifiedProofs must be false for production.",
    );
  });

  it("reports all missing Solana source verifier and adapter material", () => {
    const manifest = {
      sourceVerifierMaterial: {
        sourceDomain: 3,
        targetDomain: 0,
        placeholderMaterial: true,
        disabledReason: "source verifier unavailable",
      },
      sourceAdapterEngineDeployment: {
        sourceDomain: 3,
        targetDomain: 0,
        placeholderMaterial: true,
        disabledReason: "adapter unavailable",
      },
    };

    expect(() => checkSourceLaneMaterial(manifest)).toThrow(
      /sourceVerifierMaterial\.sourceTrustAnchorHash.*sourceAdapterEngineDeployment\.adapterVerifierVkHash/su,
    );
    expect(() => checkSourceLaneMaterial(manifest)).toThrow(
      /sourceVerifierMaterial\.placeholderMaterial.*sourceAdapterEngineDeployment\.placeholderMaterial/su,
    );
  });

  const sourceLaneMaterial = () => ({
    sourceVerifierMaterial: {
      version: 1,
      routeId: "taira_sol_xor",
      sourceDomain: 3,
      targetDomain: 0,
      sourceChain: "sol",
      solanaNetwork: SOLANA_TESTNET_NETWORK_ID,
      genesisHash: SOLANA_TESTNET_GENESIS_HASH,
      proofBackend: SOLANA_SOURCE_PROOF_BACKEND,
      sourceProofPlan: SOLANA_SOURCE_PROOF_PLAN,
      finalityModel: SOLANA_SOURCE_FINALITY_MODEL,
      adapterCircuitId: SOLANA_SOURCE_ADAPTER_CIRCUIT_ID,
      ...SOLANA_TESTNET_SOURCE_PROFILE,
      placeholderMaterial: false,
      sourceTrustAnchorHash: `0x${"11".repeat(32)}`,
      consensusVerifierHash: `0x${"12".repeat(32)}`,
      messageInclusionVerifierHash: `0x${"13".repeat(32)}`,
      finalityPolicyHash: `0x${"14".repeat(32)}`,
      sourceStateVerifierHash: `0x${"15".repeat(32)}`,
    },
    sourceAdapterEngineDeployment: {
      version: 1,
      routeId: "taira_sol_xor",
      sourceDomain: 3,
      targetDomain: 0,
      sourceChain: "sol",
      solanaNetwork: SOLANA_TESTNET_NETWORK_ID,
      genesisHash: SOLANA_TESTNET_GENESIS_HASH,
      proofBackend: SOLANA_SOURCE_PROOF_BACKEND,
      sourceProofPlan: SOLANA_SOURCE_PROOF_PLAN,
      finalityModel: SOLANA_SOURCE_FINALITY_MODEL,
      adapterCircuitId: SOLANA_SOURCE_ADAPTER_CIRCUIT_ID,
      adapterProofFamily: SOLANA_SOURCE_ADAPTER_PROOF_FAMILY,
      ...SOLANA_TESTNET_SOURCE_PROFILE,
      placeholderMaterial: false,
      sourceTrustAnchorHash: `0x${"21".repeat(32)}`,
      consensusVerifierHash: `0x${"22".repeat(32)}`,
      messageInclusionVerifierHash: `0x${"23".repeat(32)}`,
      finalityPolicyHash: `0x${"24".repeat(32)}`,
      sourceStateVerifierHash: `0x${"25".repeat(32)}`,
      adapterVerifierVkHash: `0x${"26".repeat(32)}`,
      deploymentReceiptHash: `0x${"27".repeat(32)}`,
    },
  });

  it("accepts complete Solana source verifier and adapter material", () => {
    expect(checkSourceLaneMaterial(sourceLaneMaterial())).toMatchObject({
      verifier: {
        sourceDomain: 3,
        placeholderMaterial: false,
      },
      adapter: {
        sourceDomain: 3,
        adapterVerifierVkHash: `0x${"26".repeat(32)}`,
      },
      verifierIdentity: {
        routeId: "taira_sol_xor",
        sourceDomain: 3,
        targetDomain: 0,
        solanaNetwork: SOLANA_TESTNET_NETWORK_ID,
        genesisHash: SOLANA_TESTNET_GENESIS_HASH,
        proofBackend: SOLANA_SOURCE_PROOF_BACKEND,
        sourceTrustAnchorId: SOLANA_TESTNET_SOURCE_PROFILE.sourceTrustAnchorId,
      },
      adapterIdentity: {
        routeId: "taira_sol_xor",
        adapterProofFamily: SOLANA_SOURCE_ADAPTER_PROOF_FAMILY,
      },
    });
  });

  it("requires every route, network, domain, backend, and source-profile identity on both source records", () => {
    const requiredIdentityFields = [
      ["version", "version"],
      ["routeId", "routeId"],
      ["sourceDomain", "sourceDomain"],
      ["targetDomain", "targetDomain"],
      ["sourceChain", "sourceChain"],
      ["solanaNetwork", "solanaNetwork"],
      ["genesisHash", "genesisHash"],
      ["proofBackend", "proofBackend"],
      ["sourceProofPlan", "sourceProofPlan"],
      ["finalityModel", "finalityModel"],
      ["adapterCircuitId", "adapterCircuitId"],
      ["sourceTrustAnchorId", "sourceTrustAnchorId"],
      ["consensusVerifierId", "consensusVerifierId"],
      ["messageInclusionVerifierId", "messageInclusionVerifierId"],
      ["sourceStateVerifierId", "sourceStateVerifierId"],
      ["finalityPolicyId", "finalityPolicyId"],
      ["placeholderMaterial", "placeholderMaterial"],
    ];
    for (const recordName of [
      "sourceVerifierMaterial",
      "sourceAdapterEngineDeployment",
    ]) {
      for (const [field, label] of requiredIdentityFields) {
        const material = sourceLaneMaterial();
        delete material[recordName][field];
        expect(
          () => checkSourceLaneMaterial(material),
          `${recordName}.${field}`,
        ).toThrow(`${recordName}.${label}`);
      }
    }
    const missingAdapterFamily = sourceLaneMaterial();
    delete missingAdapterFamily.sourceAdapterEngineDeployment
      .adapterProofFamily;
    expect(() => checkSourceLaneMaterial(missingAdapterFamily)).toThrow(
      "sourceAdapterEngineDeployment.adapterProofFamily is missing",
    );
  });

  it("rejects cross-route, cross-network, cross-domain, backend, and profile substitutions", () => {
    const substitutions = [
      ["routeId", "other_sol_route", "routeId must be taira_sol_xor"],
      ["sourceDomain", 0, "sourceDomain must be 3"],
      ["targetDomain", 3, "targetDomain must be 0"],
      ["sourceChain", "solana-testnet", "sourceChain must be sol"],
      [
        "solanaNetwork",
        "solana-mainnet-beta",
        "solanaNetwork must be solana-testnet",
      ],
      [
        "genesisHash",
        "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
        `genesisHash must be ${SOLANA_TESTNET_GENESIS_HASH}`,
      ],
      [
        "proofBackend",
        "sccp-solana-recursive-mainnet-v1",
        `proofBackend must be ${SOLANA_SOURCE_PROOF_BACKEND}`,
      ],
      [
        "sourceTrustAnchorId",
        "sccp:sol:source-trust-anchor:solana-mainnet-beta-genesis:v1",
        `sourceTrustAnchorId must be ${SOLANA_TESTNET_SOURCE_PROFILE.sourceTrustAnchorId}`,
      ],
      [
        "consensusVerifierId",
        "sccp:sol:consensus-verifier:finalized-slot-bankhash-mainnet-beta:v1",
        `consensusVerifierId must be ${SOLANA_TESTNET_SOURCE_PROFILE.consensusVerifierId}`,
      ],
    ];
    for (const recordName of [
      "sourceVerifierMaterial",
      "sourceAdapterEngineDeployment",
    ]) {
      for (const [field, replacement, expectedError] of substitutions) {
        const material = sourceLaneMaterial();
        material[recordName][field] = replacement;
        expect(
          () => checkSourceLaneMaterial(material),
          `${recordName}.${field}`,
        ).toThrow(`${recordName}.${expectedError}`);
      }
    }
    const paddedRoute = sourceLaneMaterial();
    paddedRoute.sourceVerifierMaterial.routeId = "taira_sol_xor ";
    expect(() => checkSourceLaneMaterial(paddedRoute)).toThrow(
      "sourceVerifierMaterial.routeId must use its exact canonical string form",
    );
  });

  it("rejects conflicting Solana source material aliases", () => {
    expect(() =>
      checkSourceLaneMaterial({
        ...sourceLaneMaterial(),
        sourceVerifierMaterial: {
          ...sourceLaneMaterial().sourceVerifierMaterial,
          source_domain: 0,
        },
      }),
    ).toThrow("sourceVerifierMaterial.sourceDomain aliases must agree");
    expect(() =>
      checkSourceLaneMaterial({
        ...sourceLaneMaterial(),
        sourceVerifierMaterial: {
          ...sourceLaneMaterial().sourceVerifierMaterial,
          source_trust_anchor_hash: `0x${"99".repeat(32)}`,
        },
      }),
    ).toThrow(
      "sourceVerifierMaterial.sourceTrustAnchorHash aliases must agree",
    );
    expect(() =>
      checkSourceLaneMaterial({
        ...sourceLaneMaterial(),
        source_verifier_material: {
          ...sourceLaneMaterial().sourceVerifierMaterial,
          sourceTrustAnchorHash: `0x${"88".repeat(32)}`,
        },
      }),
    ).toThrow("sourceVerifierMaterial aliases must agree");
  });

  it("rejects hidden Solana source placeholder and disabled aliases", () => {
    expect(() =>
      checkSourceLaneMaterial({
        ...sourceLaneMaterial(),
        sourceVerifierMaterial: {
          ...sourceLaneMaterial().sourceVerifierMaterial,
          placeholder_material: true,
        },
      }),
    ).toThrow("sourceVerifierMaterial.placeholderMaterial must be false");
    expect(() =>
      checkSourceLaneMaterial({
        ...sourceLaneMaterial(),
        sourceAdapterEngineDeployment: {
          ...sourceLaneMaterial().sourceAdapterEngineDeployment,
          disabled_reason: "source adapter not governed",
        },
      }),
    ).toThrow("sourceAdapterEngineDeployment.disabledReason must be absent");
  });

  it("requires route-published Solana browser prover module hashes", () => {
    const manifest = {
      destinationBrowserProver: {
        moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
        moduleHash: `0x${"11".repeat(32)}`,
        sidecarHash: `0x${"33".repeat(32)}`,
        ...destinationProverProfile,
        productionProofsReady: true,
      },
      sourceBrowserProver: {
        moduleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
        moduleHash: `0x${"22".repeat(32)}`,
        sidecarHash: `0x${"44".repeat(32)}`,
        ...sourceProverProfile,
        productionProofsReady: true,
      },
    };

    expect(checkProverModules(manifest)).toEqual({
      destinationModuleUrl:
        "/sccp-solana/taira-solana-xor-destination-prover.js",
      destinationModuleHash: `0x${"11".repeat(32)}`,
      destinationSidecarHash: `0x${"33".repeat(32)}`,
      destinationProofBackend: SOLANA_DESTINATION_PROOF_BACKEND,
      destinationRequiredProofBackend: SOLANA_DESTINATION_PROOF_BACKEND,
      destinationGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
      destinationVerifierPlan: SOLANA_DESTINATION_VERIFIER_PLAN,
      destinationVerifierTarget: SOLANA_VERIFIER_TARGET,
      destinationProductionProofsReady: true,
      sourceModuleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
      sourceModuleHash: `0x${"22".repeat(32)}`,
      sourceSidecarHash: `0x${"44".repeat(32)}`,
      sourceProofBackend: SOLANA_SOURCE_PROOF_BACKEND,
      sourceRequiredProofBackend: SOLANA_SOURCE_PROOF_BACKEND,
      sourceGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
      sourceProductionProofsReady: true,
    });

    expect(() =>
      checkProverModules({
        ...manifest,
        sourceBrowserProver: {
          ...manifest.sourceBrowserProver,
          sidecarHash: "",
        },
      }),
    ).toThrow("Solana source proof sidecar hash must be a 32-byte hex value.");

    expect(() =>
      checkProverModules({
        ...manifest,
        destinationBrowserProver: {
          ...manifest.destinationBrowserProver,
          requiredProofBackend: "sccp-solana-recursive-testnet-v1",
        },
      }),
    ).toThrow(
      `Solana destination required proof backend must be ${SOLANA_DESTINATION_PROOF_BACKEND}.`,
    );

    expect(() =>
      checkProverModules({
        ...manifest,
        destinationBrowserProver: {
          ...manifest.destinationBrowserProver,
          proofBackend: SOLANA_SOURCE_PROOF_BACKEND,
        },
      }),
    ).toThrow(
      `Solana destination proof backend must be ${SOLANA_DESTINATION_PROOF_BACKEND}.`,
    );
    expect(() =>
      checkProverModules({
        ...manifest,
        sourceBrowserProver: {
          ...manifest.sourceBrowserProver,
          proofBackend: SOLANA_DESTINATION_PROOF_BACKEND,
        },
      }),
    ).toThrow(
      `Solana source proof backend must be ${SOLANA_SOURCE_PROOF_BACKEND}.`,
    );
  });

  it("emits fail-closed production and browser prover checks without a route manifest", async () => {
    const server = createServer((request, response) => {
      if (request.url === "/v1/sccp/capabilities") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            proofSubmitPath: "/v1/sccp/proofs",
            messageSubmitPath: "/v1/sccp/messages",
            counterparties: [
              {
                domain: 3,
                chain: "sol",
                counterparty_account_codec: 3,
                counterparty_account_codec_key: "solana_base58",
                production_ready: false,
              },
            ],
          }),
        );
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const tempDir = await mkdtemp(
      path.join(tmpdir(), "sccp-solana-preflight-"),
    );
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "localhost", resolve);
      });
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const manifestFile = path.join(tempDir, "manifest-set.json");
      await writeFile(
        manifestFile,
        `${JSON.stringify({
          manifests: [
            {
              counterparty_domain: 3,
              chain: "sol",
              counterparty_account_codec: 3,
              counterparty_account_codec_key: "solana_base58",
              production_ready: false,
            },
          ],
          routes: [],
        })}\n`,
      );

      const { report } = await runSccpSolanaRoutePreflight({
        toriiUrl: `http://localhost:${port}`,
        manifestFile,
        outputDir: tempDir,
        skipSolanaRpc: true,
      });
      const checks = new Map(report.checks.map((check) => [check.id, check]));

      expect(report.ready).toBe(false);
      expect(report.failedCheckIds).toEqual(
        expect.arrayContaining([
          "solana-route-instance-publication",
          "route-manifest-shape",
          "production-ready-flag",
          "browser-proof-modules",
        ]),
      );
      expect(report.blockerIds).toEqual(report.failedCheckIds);
      expect(checks.get("solana-route-instance-publication")).toMatchObject({
        status: "fail",
        detail:
          "Public TAIRA exposes a generic Solana SCCP lane template, but no taira_sol_xor Solana route instance is published.",
        evidence: {
          expectedRouteId: "taira_sol_xor",
          expectedAssetKey: "xor",
        },
      });
      expect(checks.get("route-manifest-shape")).toMatchObject({
        status: "fail",
        detail: "No taira_sol_xor Solana testnet manifest found.",
      });
      expect(checks.get("production-ready-flag")).toMatchObject({
        status: "fail",
        detail: "Solana route manifest is missing.",
      });
      expect(checks.get("browser-proof-modules")).toMatchObject({
        status: "fail",
        detail:
          "Cannot validate Solana browser proof modules because no taira_sol_xor Solana route manifest is published.",
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("fails closed when the Solana production-ready flag is absent or disabled", () => {
    expect(() => checkProductionReadyFlag(null)).toThrow(
      "Solana route manifest is missing.",
    );
    expect(() => checkProductionReadyFlag({ production_ready: false })).toThrow(
      "Solana route manifest is not production-ready.",
    );
    expect(() =>
      checkProductionReadyFlag({
        production_ready: true,
        disabled_reason: "operator rollout paused",
      }),
    ).toThrow("production-ready Solana manifest carries a disabled reason.");
    expect(() =>
      checkProductionReadyFlag({
        productionReady: true,
        production_ready: false,
      }),
    ).toThrow("Solana route production-ready flag aliases must agree");
    expect(checkProductionReadyFlag({ production_ready: true })).toEqual({
      productionReady: true,
    });
  });

  it("rejects conflicting route-published Solana browser prover aliases", () => {
    const manifest = {
      destinationBrowserProver: {
        moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
        module_url: "/sccp-solana/forged-destination-prover.js",
        moduleHash: `0x${"11".repeat(32)}`,
        module_hash: `0x${"11".repeat(32)}`,
        sidecarHash: `0x${"33".repeat(32)}`,
        manifest_hash: `0x${"33".repeat(32)}`,
        ...destinationProverProfile,
        productionProofsReady: true,
      },
      sourceBrowserProver: {
        moduleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
        moduleHash: `0x${"22".repeat(32)}`,
        module_hash: `0x${"33".repeat(32)}`,
        sidecarHash: `0x${"44".repeat(32)}`,
        ...sourceProverProfile,
        productionProofsReady: true,
      },
    };

    expect(() => checkProverModules(manifest)).toThrow(
      "Solana destination proof module URL aliases must agree",
    );
    expect(() =>
      checkProverModules({
        ...manifest,
        destinationBrowserProver: {
          ...manifest.destinationBrowserProver,
          module_url: "/sccp-solana/taira-solana-xor-destination-prover.js",
        },
      }),
    ).toThrow("Solana source proof module hash aliases must agree");
  });

  it("rejects conflicting duplicate Solana browser prover records", () => {
    const manifest = {
      destinationBrowserProver: {
        moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
        moduleHash: `0x${"11".repeat(32)}`,
        sidecarHash: `0x${"33".repeat(32)}`,
        ...destinationProverProfile,
        productionProofsReady: true,
      },
      destination_browser_prover: {
        moduleUrl: "/sccp-solana/taira-solana-xor-destination-prover.js",
        moduleHash: `0x${"44".repeat(32)}`,
        sidecarHash: `0x${"33".repeat(32)}`,
        ...destinationProverProfile,
        productionProofsReady: true,
      },
      sourceBrowserProver: {
        moduleUrl: "/sccp-solana/taira-solana-xor-source-prover.js",
        moduleHash: `0x${"22".repeat(32)}`,
        sidecarHash: `0x${"55".repeat(32)}`,
        ...sourceProverProfile,
        productionProofsReady: true,
      },
    };

    expect(() => checkProverModules(manifest)).toThrow(
      "Solana destination proof module hash aliases must agree",
    );
  });

  it("extracts canonical Solana route deployment addresses without retired aliases", async () => {
    const server = createServer((request, response) => {
      if (request.url === "/v1/sccp/capabilities") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            proofSubmitPath: "/v1/sccp/proofs",
            messageSubmitPath: "/v1/sccp/messages",
            counterparties: [
              {
                domain: 3,
                chain: "sol",
                counterparty_account_codec: 3,
                counterparty_account_codec_key: "solana_base58",
                production_ready: false,
              },
            ],
          }),
        );
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const tempDir = await mkdtemp(
      path.join(tmpdir(), "sccp-solana-canonical-manifest-"),
    );
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "localhost", resolve);
      });
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const manifestFile = path.join(tempDir, "manifest-set.json");
      const manifest = {
        route_id: "taira_sol_xor",
        asset_key: "xor",
        counterparty_domain: 3,
        chain: "solana-testnet",
        solana_network: "testnet",
        network_id: SOLANA_TESTNET_NETWORK_ID,
        counterparty_account_codec_key: "solana_base58",
        counterparty_account_codec: 3,
        verifier_target: "SolanaProgram",
        destination_verifier_plan: SOLANA_DESTINATION_VERIFIER_PLAN,
        solana_genesis_hash: SOLANA_TESTNET_GENESIS_HASH,
        production_ready: false,
        taira_xor_bridge_address:
          "3fqZxTGzJe15Q3a11Awvdbafr4W4KtqcCwzAzoo4fkeF",
        taira_xor_token_address: "Eig8Yu1vmx2KeHXfxZ7LBs6J8cCYGu43aGcTiHFiegpE",
        sccp_solana_source_bridge_address:
          "4ZKKGz983uec9Bcx6YA9nZ5tcAKCPi514tFyHuFGjcLq",
        solana_verifier_program_id:
          "9bzxKEoS8FZujENQJtCp9RfCmoaEsJMwUKNkuELXJWq",
        solana_native_verifier_program_id:
          "GgBaCs3NCBuZN12kCJgAW63ydqohFkHEdfdEXBPzLHq",
        solana_verifier_state_address:
          "GqukPhv4FAVkkFNdQb1Qg6rdHW4XMmbbBSn4Dm8TGmtE",
        solana_source_state_address:
          "GVbYggJWaCGwQk8xFp36hsUdTwv9DGWhnEVgw8j4ADit",
      };
      await writeFile(
        manifestFile,
        `${JSON.stringify({ manifests: [], routes: [manifest] })}\n`,
      );

      const { report } = await runSccpSolanaRoutePreflight({
        toriiUrl: `http://localhost:${port}`,
        manifestFile,
        outputDir: tempDir,
        skipSolanaRpc: true,
      });
      const checks = new Map(report.checks.map((check) => [check.id, check]));

      expect(checks.get("route-manifest-shape")).toMatchObject({
        status: "pass",
        evidence: {
          manifestCanonicalSha256: solanaRouteManifestCanonicalSha256(manifest),
        },
      });
      expect(checks.get("solana-deployment-addresses")).toMatchObject({
        status: "pass",
        evidence: {
          bridgeProgramAddress: "3fqZxTGzJe15Q3a11Awvdbafr4W4KtqcCwzAzoo4fkeF",
          tokenMintAddress: "Eig8Yu1vmx2KeHXfxZ7LBs6J8cCYGu43aGcTiHFiegpE",
          sourceBridgeProgramAddress:
            "4ZKKGz983uec9Bcx6YA9nZ5tcAKCPi514tFyHuFGjcLq",
          nativeVerifierProgramAddress:
            "GgBaCs3NCBuZN12kCJgAW63ydqohFkHEdfdEXBPzLHq",
        },
      });
      expect(report.deployment).toMatchObject({
        bridgeProgramAddress: "3fqZxTGzJe15Q3a11Awvdbafr4W4KtqcCwzAzoo4fkeF",
        tokenMintAddress: "Eig8Yu1vmx2KeHXfxZ7LBs6J8cCYGu43aGcTiHFiegpE",
        nativeVerifierProgramAddress:
          "GgBaCs3NCBuZN12kCJgAW63ydqohFkHEdfdEXBPzLHq",
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("selects route, generic lane, and capability as independent exact records", () => {
    const route = canonicalSolanaRouteRecord();
    const lane = canonicalSolanaLaneRecord();
    const capability = canonicalSolanaLaneRecord({ domain: 3 });
    delete capability.counterparty_domain;

    expect(
      pickSolanaRouteManifest({ manifests: [lane], routes: [route] }),
    ).toBe(route);
    expect(pickSolanaLaneManifest({ manifests: [lane], routes: [route] })).toBe(
      lane,
    );
    expect(pickSolanaCapability({ counterparties: [capability] })).toBe(
      capability,
    );
    expect(pickSolanaLaneManifest({ routes: [route] })).toBeNull();
  });

  it("rejects identical duplicate route records across endpoint collections", () => {
    const route = canonicalSolanaRouteRecord();
    expect(() =>
      pickSolanaRouteManifest({ manifests: [route], routes: [route] }),
    ).toThrow(
      "Expected at most one canonical taira_sol_xor route record; found 2",
    );
    expect(() =>
      pickSolanaRouteManifest({
        routes: [route, structuredClone(route)],
      }),
    ).toThrow(
      "Duplicate records are ambiguous even when their JSON is identical",
    );
  });

  it("reports ambiguous route cardinality without running downstream checks on a chosen record", async () => {
    const capability = canonicalSolanaLaneRecord({ domain: 3 });
    delete capability.counterparty_domain;
    const server = createServer((request, response) => {
      if (request.url === "/v1/sccp/capabilities") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            proofSubmitPath: "/v1/sccp/proofs",
            messageSubmitPath: "/v1/sccp/messages",
            counterparties: [capability],
          }),
        );
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not found" }));
    });
    const tempDir = await mkdtemp(
      path.join(tmpdir(), "sccp-solana-ambiguous-route-"),
    );
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "localhost", resolve);
      });
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const route = canonicalSolanaRouteRecord();
      const manifestFile = path.join(tempDir, "manifest-set.json");
      await writeFile(
        manifestFile,
        `${JSON.stringify({ routes: [route, structuredClone(route)] })}\n`,
      );

      const { report } = await runSccpSolanaRoutePreflight({
        toriiUrl: `http://localhost:${port}`,
        manifestFile,
        outputDir: tempDir,
        skipSolanaRpc: true,
      });
      const checks = new Map(report.checks.map((check) => [check.id, check]));
      expect(report.ready).toBe(false);
      expect(checks.get("solana-route-instance-publication")).toMatchObject({
        status: "fail",
        detail: expect.stringContaining("route selection failed"),
      });
      expect(checks.get("route-manifest-shape")).toMatchObject({
        status: "fail",
        detail: expect.stringContaining("route selection failed"),
      });
      expect(checks.get("production-ready-flag")).toMatchObject({
        status: "fail",
        detail: expect.stringContaining("route selection failed"),
      });
      expect(
        report.checks.some(
          (check) => check.id === "solana-deployment-addresses",
        ),
      ).toBe(false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("rejects conflicting and partially canonical route claimants instead of choosing the first", () => {
    const valid = canonicalSolanaRouteRecord();
    for (const [overrides, expected] of [
      [
        { route_id: " taira_sol_xor" },
        "taira_sol_xor route id must use its exact canonical string form",
      ],
      [{ asset_key: "dot" }, "taira_sol_xor asset key must be xor"],
      [
        { chain: "solana-mainnet-beta" },
        "taira_sol_xor chain must be solana-testnet",
      ],
      [
        { solana_network: "mainnet-beta" },
        "taira_sol_xor Solana network must be testnet",
      ],
      [
        { network_id: "solana-devnet" },
        "taira_sol_xor network id must be solana-testnet",
      ],
      [
        { counterparty_domain: 2 },
        "taira_sol_xor counterparty domain must be 3",
      ],
      [
        { counterparty_account_codec: 1 },
        "taira_sol_xor account codec id must be 3",
      ],
      [
        { verifier_target: "EvmContract" },
        "taira_sol_xor verifier target must be SolanaProgram",
      ],
      [
        { solana_genesis_hash: "mainnet" },
        `taira_sol_xor Solana genesis hash must be ${SOLANA_TESTNET_GENESIS_HASH}`,
      ],
    ]) {
      expect(
        () =>
          pickSolanaRouteManifest({
            routes: [valid, canonicalSolanaRouteRecord(overrides)],
          }),
        JSON.stringify(overrides),
      ).toThrow(expected);
    }
  });

  it("rejects route identity alias conflicts and never uses a favorable alias", () => {
    expect(() =>
      pickSolanaRouteManifest({
        routes: [canonicalSolanaRouteRecord({ routeId: "attacker_sol_route" })],
      }),
    ).toThrow("SCCP route id aliases must agree");
    expect(() =>
      pickSolanaRouteManifest({
        routes: [canonicalSolanaRouteRecord({ assetKey: "dot" })],
      }),
    ).toThrow("taira_sol_xor asset key aliases must agree");
    expect(() =>
      pickSolanaRouteManifest({
        routes: [canonicalSolanaRouteRecord({ counterpartyDomain: 2 })],
      }),
    ).toThrow("taira_sol_xor counterparty domain aliases must agree");
  });

  it("rejects duplicate or internally conflicting generic Solana lane records", () => {
    const lane = canonicalSolanaLaneRecord();
    expect(() =>
      pickSolanaLaneManifest({ manifests: [lane, structuredClone(lane)] }),
    ).toThrow(
      "Expected at most one canonical Solana lane manifest record; found 2",
    );
    expect(() =>
      pickSolanaLaneManifest({
        manifests: [canonicalSolanaLaneRecord({ domain: 2 })],
      }),
    ).toThrow("Solana counterparty domain aliases must agree");
    expect(() =>
      pickSolanaLaneManifest({
        manifests: [canonicalSolanaLaneRecord({ chain: "eth" })],
      }),
    ).toThrow("Solana lane manifest chain must be sol");
    expect(() =>
      pickSolanaLaneManifest({
        manifests: [
          canonicalSolanaLaneRecord({
            counterparty_account_codec_key: "evm_hex",
          }),
        ],
      }),
    ).toThrow("Solana lane manifest account codec key must be solana_base58");
  });

  it("rejects duplicate, conflicting, and mixed-chain Solana capability records", () => {
    const capability = canonicalSolanaLaneRecord({ domain: 3 });
    delete capability.counterparty_domain;
    expect(() =>
      pickSolanaCapability({
        counterparties: [capability, structuredClone(capability)],
      }),
    ).toThrow(
      "Expected at most one canonical Solana capability record; found 2",
    );
    expect(() =>
      pickSolanaCapability({
        counterparties: [{ ...capability, counterparty_domain: 2 }],
      }),
    ).toThrow("Solana counterparty domain aliases must agree");
    expect(() =>
      pickSolanaCapability({
        counterparties: [{ ...capability, chain: "eth" }],
      }),
    ).toThrow("Solana capability record chain must be sol");
    expect(() =>
      pickSolanaCapability({
        counterparties: [
          capability,
          canonicalSolanaLaneRecord({ chain: "eth" }),
        ],
      }),
    ).toThrow("Solana capability record chain must be sol");
  });

  it("rejects nested lane evidence split across conflicting aliases or locations", () => {
    expect(() =>
      summarizeSolanaLaneManifest({
        ...canonicalSolanaLaneRecord(),
        productionReady: true,
      }),
    ).toThrow("Solana lane production-ready flag aliases must agree");
    expect(() =>
      summarizeSolanaLaneManifest({
        ...canonicalSolanaLaneRecord(),
        destinationRollout: { anchorsReady: true },
        destination_rollout: { anchors_ready: false },
      }),
    ).toThrow("destinationRollout aliases must agree");
    expect(() =>
      summarizeSolanaLaneManifest({
        ...canonicalSolanaLaneRecord(),
        sourceAdapterEngine: { productionReady: true },
        productionReadiness: {
          sourceAdapterEngine: { sourceVerifierMaterialReady: true },
        },
      }),
    ).toThrow("evidence must not be spliced across records");
    expect(() =>
      summarizeSolanaLaneManifest({
        ...canonicalSolanaLaneRecord(),
        productionReadiness: { productionReady: true },
        production_readiness: { production_ready: false },
      }),
    ).toThrow("productionReadiness aliases must agree");
  });

  it("reports generic public Solana lane evidence without treating it as the route manifest", () => {
    const manifestSet = {
      manifests: [
        {
          version: 1,
          local_domain: 0,
          local_chain: "sora",
          counterparty_domain: 3,
          chain: "sol",
          counterparty_account_codec: 3,
          counterparty_account_codec_key: "solana_base58",
          production_ready: false,
          disabled_reason:
            "disabled until the immutable Solana recursive SCCP verifier and cryptographic trust anchors are live for this lane",
          destination_rollout: {
            immutable_verifier_ready: false,
            anchors_ready: false,
            blockers: [
              "immutable Solana verifier program is not deployed for this SCCP lane",
              "cryptographic trust anchor is not active for this SCCP lane",
            ],
          },
          production_readiness: {
            source_adapter_ready: false,
            routes_allowlisted: false,
            production_ready: false,
            blockers: [
              "production route allowlist is not anchored for this SCCP lane",
            ],
            source_adapter_engine: {
              source_verifier_material_ready: false,
              source_trust_anchor_ready: false,
              production_ready: false,
              blockers: [
                "source verifier material is not production-ready for this SCCP lane",
              ],
            },
            route_allowlist: {
              activation_policy: "GovernanceAllowlist",
              routes_allowlisted: false,
              blockers: [
                "governance has not activated this SCCP route profile",
              ],
            },
          },
        },
      ],
      routes: [],
    };

    const lane = pickSolanaLaneManifest(manifestSet);

    expect(lane).toBe(manifestSet.manifests[0]);
    expect(pickSolanaRouteManifest(manifestSet)).toBeNull();
    expect(checkSolanaRouteInstancePublication(null, lane)).toMatchObject({
      id: "solana-route-instance-publication",
      status: "fail",
      detail:
        "Public TAIRA exposes a generic Solana SCCP lane template, but no taira_sol_xor Solana route instance is published.",
      evidence: {
        expectedRouteId: "taira_sol_xor",
        expectedAssetKey: "xor",
      },
    });
    expect(summarizeSolanaLaneManifest(lane)).toMatchObject({
      routeId: "",
      assetKey: "",
      chain: "sol",
      counterpartyDomain: 3,
      counterpartyAccountCodecKey: "solana_base58",
      productionReady: false,
      destinationRollout: {
        immutableVerifierReady: false,
        anchorsReady: false,
        blockers: [
          "immutable Solana verifier program is not deployed for this SCCP lane",
          "cryptographic trust anchor is not active for this SCCP lane",
        ],
      },
      productionReadiness: {
        sourceAdapterReady: false,
        routesAllowlisted: false,
        productionReady: false,
        blockers: [
          "production route allowlist is not anchored for this SCCP lane",
        ],
      },
      sourceAdapterEngine: {
        sourceVerifierMaterialReady: false,
        sourceTrustAnchorReady: false,
        productionReady: false,
        blockers: [
          "source verifier material is not production-ready for this SCCP lane",
        ],
      },
      routeAllowlist: {
        activationPolicy: "GovernanceAllowlist",
        routesAllowlisted: false,
        blockers: ["governance has not activated this SCCP route profile"],
      },
    });
    expect(checkSolanaLanePublication(lane)).toMatchObject({
      id: "solana-lane-publication",
      status: "fail",
      detail:
        "disabled until the immutable Solana recursive SCCP verifier and cryptographic trust anchors are live for this lane",
      evidence: {
        chain: "sol",
        productionReady: false,
        blockerIds: [
          "immutable-solana-verifier-program",
          "active-solana-trust-anchor",
          "solana-production-route-allowlist",
          "solana-source-verifier-material",
          "solana-route-profile-governance-activation",
          "solana-verifier-enforcement-mode",
          "solana-verifier-enforcement-evidence-hash",
        ],
        blockerDetails: expect.arrayContaining([
          expect.objectContaining({
            id: "immutable-solana-verifier-program",
            detail:
              "immutable Solana verifier program is not deployed for this SCCP lane",
          }),
          expect.objectContaining({
            id: "active-solana-trust-anchor",
            detail:
              "cryptographic trust anchor is not active for this SCCP lane",
          }),
        ]),
      },
    });
  });

  it("rejects readiness evidence splicing between a lane and capability record", () => {
    const lane = {
      counterparty_domain: 3,
      chain: "sol",
      counterparty_account_codec: 3,
      counterparty_account_codec_key: "solana_base58",
      disabled_reason:
        "disabled until the immutable Solana recursive SCCP verifier and cryptographic trust anchors are live for this lane",
      destination_rollout: {
        immutable_verifier_ready: false,
        anchors_ready: false,
        blockers: [
          "immutable Solana verifier program is not deployed for this SCCP lane",
        ],
      },
    };
    const capability = {
      domain: 3,
      chain: "sol",
      counterparty_account_codec: 3,
      counterparty_account_codec_key: "solana_base58",
      production_readiness: {
        source_adapter_ready: false,
        routes_allowlisted: false,
        production_ready: false,
        blockers: [
          "source verifier material is not production-ready for this SCCP lane",
          "production route allowlist is not anchored for this SCCP lane",
        ],
        source_adapter_engine: {
          source_verifier_material_ready: false,
          source_verifier_material: {
            source_domain: 3,
            source_chain: "sol",
            source_trust_anchor_hash: `0x${"11".repeat(32)}`,
            consensus_verifier_hash: `0x${"22".repeat(32)}`,
            message_inclusion_verifier_hash: `0x${"33".repeat(32)}`,
            finality_policy_hash: `0x${"44".repeat(32)}`,
            source_state_verifier_hash: `0x${"0".repeat(64)}`,
            placeholder_material: true,
          },
          blockers: [
            "Solana transaction status/message inclusion verifier and full-light-client audit evidence is not deployed for SCCP source proofs",
          ],
        },
        route_allowlist: {
          routes_allowlisted: false,
          blockers: ["governance has not activated this SCCP route profile"],
        },
      },
    };

    expect(() => mergeSolanaLaneManifestEvidence(lane, capability)).toThrow(
      "must be evaluated independently",
    );
    expect(mergeSolanaLaneManifestEvidence(lane, null)).toBe(lane);
    expect(mergeSolanaLaneManifestEvidence(null, capability)).toBe(capability);
  });

  it("passes the public Solana lane publication check only for production-ready lane manifests", () => {
    const manifest = {
      counterparty_domain: 3,
      chain: "sol",
      counterparty_account_codec: 3,
      counterparty_account_codec_key: "solana_base58",
      production_ready: true,
      destination_rollout: {
        immutable_verifier_ready: true,
        anchors_ready: true,
        proof_verification_mode: "native-recursive-verifier-v1",
        verifier_enforcement_evidence_hash: `0x${"62".repeat(32)}`,
        blockers: [],
      },
      production_readiness: {
        production_ready: true,
        source_adapter_ready: true,
        routes_allowlisted: true,
        blockers: [],
        source_adapter_engine: {
          production_ready: true,
          source_verifier_material_ready: true,
          source_trust_anchor_ready: true,
          blockers: [],
        },
        route_allowlist: {
          routes_allowlisted: true,
          blockers: [],
        },
      },
    };

    expect(checkSolanaLanePublication(manifest)).toMatchObject({
      id: "solana-lane-publication",
      status: "pass",
      detail: "Public TAIRA Solana SCCP lane manifest is production-ready.",
      evidence: {
        productionReady: true,
        blockerIds: [],
      },
    });
  });

  it("keeps immutable Solana deployment evidence distinct from missing trust anchors", () => {
    const manifest = {
      route_id: "taira_sol_xor",
      asset_key: "xor",
      counterparty_domain: 3,
      chain: "solana-testnet",
      counterparty_account_codec_key: "solana_base58",
      production_ready: false,
      disabled_reason:
        "Solana programs, mint, and state are deployed on testnet, but governed source/destination proof packages and public TAIRA route-manifest publication are not available.",
      destination_rollout: {
        verifier_identity: "G8G81amwFRSvPL7hy4dsnewgY1HemYs9fnXDRou5nyxh",
        verifier_code_hash: `0x${"20".repeat(32)}`,
        destination_bridge_address:
          "GHpTMkMezjcDTktBHHxwiEqKuBJPv4nhxwDxGY4QwoqL",
        immutable_verifier_ready: true,
        anchors_ready: false,
        blockers: [
          "cryptographic trust anchor is not active for this SCCP lane",
        ],
      },
      production_readiness: {
        immutable_verifier_ready: true,
        anchors_ready: false,
        routes_allowlisted: false,
        production_ready: false,
        blockers: [
          "production route allowlist is not anchored for this SCCP lane",
        ],
      },
    };

    expect(summarizeSolanaLaneManifest(manifest)).toMatchObject({
      destinationRollout: {
        immutableVerifierReady: true,
        anchorsReady: false,
        blockers: [
          "cryptographic trust anchor is not active for this SCCP lane",
        ],
      },
      productionReadiness: {
        immutableVerifierReady: true,
        anchorsReady: false,
        routesAllowlisted: false,
      },
    });
    expect(checkSolanaLanePublication(manifest)).toMatchObject({
      id: "solana-lane-publication",
      status: "fail",
      evidence: {
        destinationRollout: {
          immutableVerifierReady: true,
          anchorsReady: false,
        },
        blockerIds: [
          "active-solana-trust-anchor",
          "solana-production-route-allowlist",
          "solana-verifier-enforcement-mode",
          "solana-verifier-enforcement-evidence-hash",
        ],
        blockerDetails: expect.arrayContaining([
          expect.objectContaining({
            id: "active-solana-trust-anchor",
            detail:
              "cryptographic trust anchor is not active for this SCCP lane",
          }),
        ]),
      },
    });
  });

  it("summarizes Solana capability production blockers", () => {
    const capabilities = {
      counterparties: [
        {
          domain: 3,
          chain: "sol",
          counterparty_account_codec: 3,
          counterparty_account_codec_key: "solana_base58",
          production_ready: false,
          disabled_reason:
            "disabled until the immutable Solana recursive SCCP verifier and cryptographic trust anchors are live for this lane",
          production_readiness: {
            source_adapter_ready: false,
            immutable_verifier_ready: false,
            anchors_ready: false,
            routes_allowlisted: false,
            production_ready: false,
            blockers: [
              "Solana audited Tower replay evidence is not complete",
              "production route allowlist is not anchored for this SCCP lane",
            ],
            source_adapter_engine: {
              source_verifier_material_ready: false,
              source_trust_anchor_ready: false,
              external_consensus_verifier_ready: false,
              external_message_inclusion_verifier_ready: false,
              production_ready: false,
              blockers: [
                "source verifier material is not production-ready for this SCCP lane",
              ],
            },
            route_allowlist: {
              activation_policy: "GovernanceAllowlist",
              routes_allowlisted: false,
              blockers: [
                "governance has not activated this SCCP route profile",
              ],
            },
          },
        },
      ],
    };

    const capability = pickSolanaCapability(capabilities);

    expect(capability).toBe(capabilities.counterparties[0]);
    expect(summarizeSolanaLaneManifest(capability)).toMatchObject({
      chain: "sol",
      counterpartyDomain: 3,
      productionReady: false,
      disabledReason:
        "disabled until the immutable Solana recursive SCCP verifier and cryptographic trust anchors are live for this lane",
      productionReadiness: {
        sourceAdapterReady: false,
        immutableVerifierReady: false,
        anchorsReady: false,
        routesAllowlisted: false,
        productionReady: false,
        blockers: [
          "Solana audited Tower replay evidence is not complete",
          "production route allowlist is not anchored for this SCCP lane",
        ],
      },
      sourceAdapterEngine: {
        sourceVerifierMaterialReady: false,
        sourceTrustAnchorReady: false,
        externalConsensusVerifierReady: false,
        externalMessageInclusionVerifierReady: false,
        productionReady: false,
        blockers: [
          "source verifier material is not production-ready for this SCCP lane",
        ],
      },
      routeAllowlist: {
        activationPolicy: "GovernanceAllowlist",
        routesAllowlisted: false,
        blockers: ["governance has not activated this SCCP route profile"],
      },
    });
  });
});
