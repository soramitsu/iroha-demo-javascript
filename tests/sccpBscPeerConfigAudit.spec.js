import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  bscSccpPeerConfigAuditOutputDir,
  bscSccpPeerConfigAuditRunbookProblems,
  evaluateBscSccpPeerConfigAudit,
  parseSccpRouteManifestStanzas,
  readBscSccpPeerConfigFiles,
  readBscSccpRemotePeerConfigFiles,
  runBscSccpPeerConfigAudit,
  runBscSccpRemotePeerConfigAudit,
  SCCP_BSC_PEER_CONFIG_TOML_MAX_BYTES,
  SCCP_BSC_SSH_CREDENTIALS_MAX_BYTES,
  serializeSanitizedSccpRouteManifestStanzas,
} from "../scripts/e2e/sccp-bsc-peer-config-audit.mjs";

const BSC_TESTNET_NETWORK_ID_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000061";
const BSC_MAINNET_NETWORK_ID_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000038";
const fixtureHash = (label) =>
  `0x${createHash("sha256").update(Buffer.from(label, "utf8")).digest("hex")}`;
const fixtureAddress = (label) => fixtureHash(label).slice(0, 42);
const BSC_BRIDGE_ADDRESS = fixtureAddress("bsc peer config bridge");
const BSC_TOKEN_ADDRESS = fixtureAddress("bsc peer config token");
const BSC_SOURCE_BRIDGE_ADDRESS = fixtureAddress(
  "bsc peer config source bridge",
);
const BSC_VERIFIER_ADDRESS = fixtureAddress("bsc peer config verifier");
const HASH_11 = fixtureHash("bsc peer config fixture hash 11");
const HASH_22 = fixtureHash("bsc peer config fixture hash 22");
const HASH_33 = fixtureHash("bsc peer config fixture hash 33");
const HASH_44 = fixtureHash("bsc peer config fixture hash 44");
const HASH_55 = fixtureHash("bsc peer config fixture hash 55");
const HASH_66 = fixtureHash("bsc peer config fixture hash 66");
const HASH_77 = fixtureHash("bsc peer config fixture hash 77");
const HASH_88 = fixtureHash("bsc peer config fixture hash 88");
const HASH_99 = fixtureHash("bsc peer config fixture hash 99");
const SOURCE_EVENT_EXPLORER_URL = `https://testnet.bscscan.com/tx/${HASH_55}`;
const ROUTE_CANARY_EXPLORER_URL = `https://testnet.bscscan.com/tx/${HASH_77}`;
const DIAGNOSTIC_BSC_VERIFIER_KEY_HASH =
  "0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4";
const productionBurnRecordBytes = (seed, sizeBytes = 768) => {
  const chunks = [];
  let produced = 0;
  let counter = 0;
  while (produced < sizeBytes) {
    const chunk = createHash("sha256")
      .update(`sccp-bsc-peer-burn-record:${seed}:${counter}`)
      .digest();
    chunks.push(chunk);
    produced += chunk.length;
    counter += 1;
  }
  return Buffer.concat(chunks).subarray(0, sizeBytes);
};
const ARTIFACT_BYTES = productionBurnRecordBytes(0xe7);
const ARTIFACT_B64 = ARTIFACT_BYTES.toString("base64");
const ARTIFACT_SHA256 = `0x${createHash("sha256")
  .update(ARTIFACT_BYTES)
  .digest("hex")}`;
const sha256Hex = (value) =>
  `0x${createHash("sha256").update(value).digest("hex")}`;
const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const BSC_BINDING_KEY = `evm:0:2:${BSC_TESTNET_NETWORK_ID_HEX.slice(
  2,
)}:${BSC_VERIFIER_ADDRESS}:${BSC_BRIDGE_ADDRESS}:${HASH_11}:${HASH_22}`;

const routeToml = (overrides = {}) => {
  const values = {
    version: 1,
    route_id: "taira_bsc_xor",
    asset_key: "xor",
    chain: "bsc-testnet",
    chain_id_hex: "0x61",
    explorer_url: "https://testnet.bscscan.com",
    explorer_host: "testnet.bscscan.com",
    counterparty_domain: 2,
    verifier_target: "EvmContract",
    production_ready: true,
    network_id_hex: BSC_TESTNET_NETWORK_ID_HEX,
    taira_xor_token_address: BSC_TOKEN_ADDRESS,
    taira_xor_bridge_address: BSC_BRIDGE_ADDRESS,
    sccp_bsc_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
    sccp_bsc_destination_verifier_address: BSC_VERIFIER_ADDRESS,
    verifier_code_hash: HASH_11,
    verifier_key_hash: HASH_22,
    proof_artifact_hash: HASH_44,
    proving_key_hash: HASH_66,
    native_evm_prover_bundle_hash: HASH_99,
    destination_binding_key: BSC_BINDING_KEY,
    destination_binding_hash: HASH_33,
    taira_burn_record_settlement_asset_definition_id:
      "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    taira_burn_record_contract_artifact_b64: ARTIFACT_B64,
    taira_burn_record_artifact_sha256: ARTIFACT_SHA256,
    taira_burn_record_code_hash: HASH_77,
    taira_burn_record_vk_backend: "halo2/ipa",
    taira_burn_record_vk_name: "taira_bsc_xor_burn_record_v1",
    taira_burn_record_gas_limit: 2000000,
    post_deploy_full_toml_ready: true,
    post_deploy_source_bridge_config_hash: HASH_44,
    post_deploy_source_event_transaction_id: HASH_55,
    post_deploy_source_event_explorer_url: SOURCE_EVENT_EXPLORER_URL,
    post_deploy_route_canary_evidence_hash: HASH_66,
    post_deploy_route_canary_transaction_id: HASH_77,
    post_deploy_route_canary_explorer_url: ROUTE_CANARY_EXPLORER_URL,
    post_deploy_offline_full_toml_sha256: HASH_88,
    ...overrides,
  };
  const lines = ["[[zk.sccp_route_manifests]]"];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      continue;
    }
    if (typeof value === "string") {
      lines.push(
        `${key} = "${value.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}"`,
      );
    } else {
      lines.push(`${key} = ${value}`);
    }
  }
  return `${lines.join("\n")}\n`;
};

const peerConfigs = (texts) =>
  texts.map((text, index) => ({
    source: `peer${index}.toml`,
    stanzas: parseSccpRouteManifestStanzas(text, `peer${index}.toml`),
  }));

const cleanPeerConfigs = (count = 4) =>
  Array.from({ length: count }, (_, index) => ({
    source: `peer${index}.toml`,
    stanzas: [],
  }));

const failedCheck = (report, id) =>
  report.checks.find((entry) => entry.id === id && !entry.ok);

const expectSanitizedFileEvidence = (peer, sanitized, basename) => {
  expect(peer.sanitizedStanzaSource).toBeTruthy();
  expect(path.basename(peer.sanitizedStanzaSource)).toBe(basename);
  expect(peer.sanitizedStanzaFileChecked).toBe(true);
  expect(peer.sanitizedStanzaFileVerified).toBe(true);
  expect(peer.sanitizedStanzaFileSha256).toBe(sha256Hex(sanitized));
};

describe("BSC SCCP TAIRA peer config audit", () => {
  it("uses network-scoped default report directories consumed by smoke gates", () => {
    const testnetDefault = bscSccpPeerConfigAuditOutputDir();
    const mainnetDefault = bscSccpPeerConfigAuditOutputDir({
      bscNetwork: "mainnet",
    });
    const explicit = bscSccpPeerConfigAuditOutputDir({
      bscNetwork: "mainnet",
      outputDir: "output/custom-peer-audit",
    });

    expect(path.isAbsolute(testnetDefault)).toBe(true);
    expect(
      testnetDefault.endsWith(
        path.join("output", "sccp-bsc-peer-config-audit", "testnet"),
      ),
    ).toBe(true);
    expect(
      mainnetDefault.endsWith(
        path.join("output", "sccp-bsc-peer-config-audit", "mainnet"),
      ),
    ).toBe(true);
    expect(explicit.endsWith(path.join("output", "custom-peer-audit"))).toBe(
      true,
    );
    expect(
      explicit.endsWith(path.join("output", "custom-peer-audit", "mainnet")),
    ).toBe(false);
  });

  it("accepts complete BSC peer config audit runbook contracts", () => {
    expect(
      bscSccpPeerConfigAuditRunbookProblems({
        nextActions: [
          {
            id: "deploy-production-peer-route-config",
            title: "Deploy production peer route config",
            detail: "Deploy a production-ready BSC route stanza.",
            requiredInputs: [
              {
                id: "production-route-manifest",
                kind: "file",
                placeholder: "<production-route.manifest.json>",
                description: "Production route manifest.",
              },
            ],
            blockedByChecks: ["peer-route-production-readiness"],
            commands: [
              "npm run e2e:sccp:bsc-peer-config-audit -- --bsc-network testnet",
            ],
          },
        ],
        missingProductionInputs: [
          {
            id: "production-route-manifest",
            kind: "file",
            placeholder: "<production-route.manifest.json>",
            description: "Production route manifest.",
            blockedByActions: ["deploy-production-peer-route-config"],
          },
        ],
      }),
    ).toEqual([]);
  });

  it("rejects malformed BSC peer config audit runbook contracts", () => {
    const problems = bscSccpPeerConfigAuditRunbookProblems({
      nextActions: [
        {
          id: "deploy-production-peer-route-config",
          title: "",
          detail: "Deploy a production-ready BSC route stanza.",
          requiredInputs: [
            {
              id: "production-route-manifest",
              kind: "file",
              placeholder: "",
            },
          ],
          blockedByChecks: [],
          commands: "npm run e2e:sccp:bsc-peer-config-audit",
        },
      ],
      missingProductionInputs: [
        {
          id: "production-route-manifest",
          kind: "",
          placeholder: "<production-route.manifest.json>",
          description: "Production route manifest.",
          blockedByActions: "deploy-production-peer-route-config",
        },
        "not-an-input-contract",
      ],
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        "BSC peer config audit next action 0 title is missing or not a non-empty string.",
        "BSC peer config audit next action 0 required input 0 placeholder is missing or not a non-empty string.",
        "BSC peer config audit next action 0 required input 0 description is missing or not a non-empty string.",
        "BSC peer config audit next action 0 blockedByChecks is missing or empty.",
        "BSC peer config audit next action 0 commands is not an array.",
        "BSC peer config audit missing production input 0 kind is missing or not a non-empty string.",
        "BSC peer config audit missing production input 0 blockedByActions is not an array.",
        "BSC peer config audit missing production input 1 is not an object.",
      ]),
    );
  });

  it("rejects unlinked BSC peer config audit runbook contracts", () => {
    const problems = bscSccpPeerConfigAuditRunbookProblems({
      nextActions: [
        {
          id: "deploy-production-peer-route-config",
          title: "Deploy production peer route config",
          detail: "Deploy a production-ready BSC route stanza.",
          requiredInputs: [
            {
              id: "production-route-manifest",
              kind: "file",
              placeholder: "<production-route.manifest.json>",
              description: "Production route manifest.",
            },
            {
              id: "peer-config-audit-source",
              kind: "directory-or-remote",
              placeholder: "<peer-config-audit-source>",
              description: "Peer configuration source.",
            },
          ],
          blockedByChecks: ["peer-route-production-readiness"],
          commands: [
            "npm run e2e:sccp:bsc-peer-config-audit -- --bsc-network testnet",
          ],
        },
        {
          id: "refresh-peer-config-audit-source",
          title: "Refresh peer config audit source",
          detail: "Refresh the active peer config audit source.",
          requiredInputs: [
            {
              id: "testnet-expected-peer-count",
              kind: "integer",
              placeholder: "<testnet-expected-peer-count>",
              description: "Expected number of TAIRA peers.",
            },
          ],
          blockedByChecks: ["peer-config-files"],
          commands: [
            "npm run e2e:sccp:bsc-peer-config-audit -- --bsc-network testnet",
          ],
        },
        {
          id: "refresh-peer-config-audit-source",
          title: "Duplicate refresh action",
          detail: "Duplicate action id must fail.",
          requiredInputs: [
            {
              id: "testnet-expected-peer-count",
              kind: "integer",
              placeholder: "<testnet-expected-peer-count>",
              description: "Expected number of TAIRA peers.",
            },
          ],
          blockedByChecks: ["peer-config-files"],
          commands: [
            "npm run e2e:sccp:bsc-peer-config-audit -- --bsc-network testnet",
          ],
        },
      ],
      missingProductionInputs: [
        {
          id: "production-route-manifest",
          kind: "file",
          placeholder: "<production-route.manifest.json>",
          description: "Production route manifest.",
          blockedByActions: ["unknown-action"],
        },
        {
          id: "testnet-expected-peer-count",
          kind: "integer",
          placeholder: "<testnet-expected-peer-count>",
          description: "Expected number of TAIRA peers.",
          blockedByActions: ["deploy-production-peer-route-config"],
        },
        {
          id: "testnet-expected-peer-count",
          kind: "integer",
          placeholder: "<testnet-expected-peer-count>",
          description: "Duplicate input id must fail.",
          blockedByActions: ["refresh-peer-config-audit-source"],
        },
      ],
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        "BSC peer config audit next action id refresh-peer-config-audit-source is duplicated.",
        "BSC peer config audit missing production input id testnet-expected-peer-count is duplicated.",
        "BSC peer config audit missing production input production-route-manifest does not reference blocking action deploy-production-peer-route-config.",
        "BSC peer config audit next action deploy-production-peer-route-config requires input peer-config-audit-source, but missingProductionInputs does not include it.",
        "BSC peer config audit missing production input testnet-expected-peer-count does not reference blocking action refresh-peer-config-audit-source.",
        "BSC peer config audit missing production input production-route-manifest references unknown blocking action unknown-action.",
        "BSC peer config audit missing production input testnet-expected-peer-count references blocking action deploy-production-peer-route-config, but that action does not require the input.",
      ]),
    );
  });

  it("does not invoke accessor-backed BSC peer audit runbook entries", () => {
    let requiredInputReads = 0;
    let commandReads = 0;
    let blockedActionReads = 0;
    const requiredInputs = [];
    requiredInputs.length = 1;
    Object.defineProperty(requiredInputs, "0", {
      configurable: true,
      enumerable: true,
      get() {
        requiredInputReads += 1;
        return {
          id: "hidden-input",
          kind: "file",
          placeholder: "<hidden>",
          description: "hidden",
        };
      },
    });
    const commands = ["npm run e2e:sccp:bsc-peer-config-audit"];
    Object.defineProperty(commands, "1", {
      configurable: true,
      enumerable: true,
      get() {
        commandReads += 1;
        return "hidden command";
      },
    });
    const blockedByActions = ["deploy-production-peer-route-config"];
    Object.defineProperty(blockedByActions, "1", {
      configurable: true,
      enumerable: true,
      get() {
        blockedActionReads += 1;
        return "hidden-action";
      },
    });

    const problems = bscSccpPeerConfigAuditRunbookProblems({
      nextActions: [
        {
          id: "deploy-production-peer-route-config",
          title: "Deploy production peer route config",
          detail: "Deploy a production-ready BSC route stanza.",
          requiredInputs,
          blockedByChecks: ["peer-route-production-readiness"],
          commands,
        },
      ],
      missingProductionInputs: [
        {
          id: "production-route-manifest",
          kind: "file",
          placeholder: "<production-route.manifest.json>",
          description: "Production route manifest.",
          blockedByActions,
        },
      ],
    });

    expect(requiredInputReads).toBe(0);
    expect(commandReads).toBe(0);
    expect(blockedActionReads).toBe(0);
    expect(problems).toEqual(
      expect.arrayContaining([
        "BSC peer config audit next action 0 required input 0 is missing or accessor-backed.",
        "BSC peer config audit next action 0 commands 1 is missing or accessor-backed.",
        "BSC peer config audit missing production input 0 blockedByActions 1 is missing or accessor-backed.",
      ]),
    );
  });

  it("does not invoke accessor-backed top-level peer audit option fields", async () => {
    const getters = new Map(
      [
        "bscNetwork",
        "outputDir",
        "expectedPeers",
        "files",
        "dir",
        "includeBackups",
        "sanitizedStanzasDir",
        "reportOutputDir",
        "sshHost",
        "sshPassword",
        "sshPasswordFile",
        "sshCredsFile",
        "remoteDir",
        "remotePeerCount",
        "sshCommand",
        "sshpassCommand",
        "connectTimeoutSeconds",
        "execFileImpl",
      ].map((key) => [
        key,
        vi.fn(() => {
          throw new Error(`${key} getter should not run`);
        }),
      ]),
    );
    const options = {};
    for (const [key, getter] of getters) {
      Object.defineProperty(options, key, {
        configurable: true,
        enumerable: true,
        get: getter,
      });
    }

    expect(bscSccpPeerConfigAuditOutputDir(options)).toBe(
      bscSccpPeerConfigAuditOutputDir(),
    );
    expect(evaluateBscSccpPeerConfigAudit([], options).peerCount).toBe(0);
    await expect(runBscSccpPeerConfigAudit(options)).resolves.toMatchObject({
      peerCount: 0,
    });
    await expect(readBscSccpRemotePeerConfigFiles(options)).rejects.toThrow(
      /Remote peer audits require --sanitized-stanzas-dir/u,
    );
    await expect(runBscSccpRemotePeerConfigAudit(options)).rejects.toThrow(
      /Remote peer audits require --sanitized-stanzas-dir/u,
    );
    for (const getter of getters.values()) {
      expect(getter).not.toHaveBeenCalled();
    }
  });

  it("does not invoke accessor-backed direct peer config file entries", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-files-"));
    try {
      const peerFile = path.join(dir, "peer0.toml");
      await writeFile(peerFile, routeToml(), "utf8");
      const fileGetter = vi.fn(() => {
        throw new Error("peer file getter should not run");
      });
      const files = [peerFile];
      Object.defineProperty(files, "1", {
        configurable: true,
        enumerable: true,
        get: fileGetter,
      });

      const peerConfigs = await readBscSccpPeerConfigFiles(files);

      expect(peerConfigs).toHaveLength(1);
      expect(peerConfigs[0]).toMatchObject({
        source: "peer0.toml",
        rawTomlSha256: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
        sanitizedStanzaSha256: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
      });
      expect(fileGetter).not.toHaveBeenCalled();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("accepts clean peer configs with no local BSC route overrides", () => {
    const report = evaluateBscSccpPeerConfigAudit(cleanPeerConfigs(4), {
      expectedPeers: 4,
    });

    expect(report.ready).toBe(true);
    expect(report.generatedAt).toBe(
      new Date(report.generatedAtMs).toISOString(),
    );
    expect(report.peerCount).toBe(4);
    expect(report.manifestFingerprint).toBeNull();
    expect(report.peers.every((peer) => peer.ready)).toBe(true);
    expect(report.peers.every((peer) => peer.routeCount === 0)).toBe(true);
    expect(
      report.checks.find(
        (entry) => entry.id === "peer-route-burn-record-material",
      ),
    ).toMatchObject({ ok: true });
    expect(
      report.peers.every(
        (peer) => peer.burnRecordMaterialProblems.length === 0,
      ),
    ).toBe(true);
    expect(report.nextActions).toEqual([]);
    expect(report.missingProductionInputs).toEqual([]);
    expect(JSON.stringify(report)).not.toContain(ARTIFACT_B64);
  });

  it("accepts on-chain-only audit mode without peer config sources", () => {
    const report = evaluateBscSccpPeerConfigAudit([], {
      bscNetwork: "testnet",
    });

    expect(report.ready).toBe(true);
    expect(report.peerCount).toBe(0);
    expect(report.manifestFingerprint).toBeNull();
    expect(report.peers).toEqual([]);
    expect(failedCheck(report, "peer-config-files")).toBeUndefined();
    expect(
      failedCheck(report, "peer-route-production-readiness"),
    ).toBeUndefined();
    expect(report.nextActions).toEqual([]);
    expect(report.missingProductionInputs).toEqual([]);
  });

  it("rejects stale local peer route stanzas", () => {
    const missing = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml(),
        '[[zk.sccp_route_manifests]]\nroute_id = "other"\n',
      ]),
      { expectedPeers: 2 },
    );
    expect(missing.ready).toBe(false);
    expect(failedCheck(missing, "peer-route-count")?.detail).toContain(
      "peer0.toml: 1",
    );

    const duplicate = evaluateBscSccpPeerConfigAudit(
      peerConfigs([routeToml(), `${routeToml()}${routeToml()}`]),
      { expectedPeers: 2 },
    );
    expect(duplicate.ready).toBe(false);
    expect(failedCheck(duplicate, "peer-route-count")?.detail).toContain(
      "peer1.toml: 2",
    );

    const drift = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml(),
        routeToml({
          taira_xor_bridge_address:
            "0x5555555555555555555555555555555555555555",
        }),
      ]),
      { expectedPeers: 2 },
    );
    expect(drift.ready).toBe(false);
    expect(failedCheck(drift, "peer-route-consistency")?.detail).toContain(
      "peer0.toml",
    );
    expect(failedCheck(drift, "peer-route-consistency")?.detail).toContain(
      "peer1.toml",
    );
  });

  it("publishes structured missing inputs for peer config source failures", () => {
    const report = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml(),
        '[[zk.sccp_route_manifests]]\nroute_id = "other"\n',
      ]),
      { expectedPeers: 4 },
    );

    expect(report.ready).toBe(false);
    expect(report.nextActions.map((action) => action.id)).toEqual(
      expect.arrayContaining([
        "refresh-peer-config-audit-source",
        "remove-stale-peer-route-overrides",
      ]),
    );
    const sourceAction = report.nextActions.find(
      (action) => action.id === "refresh-peer-config-audit-source",
    );
    expect(sourceAction).toMatchObject({
      id: "refresh-peer-config-audit-source",
      blockedByChecks: expect.arrayContaining([
        "peer-count",
        "peer-route-count",
      ]),
      requiredInputs: expect.arrayContaining([
        expect.objectContaining({ id: "peer-config-audit-source" }),
        expect.objectContaining({ id: "testnet-expected-peer-count" }),
      ]),
    });
    expect(report.missingProductionInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "peer-config-audit-source",
          blockedByActions: expect.arrayContaining([
            "refresh-peer-config-audit-source",
          ]),
        }),
        expect.objectContaining({
          id: "testnet-expected-peer-count",
          blockedByActions: ["refresh-peer-config-audit-source"],
        }),
      ]),
    );
  });

  it("rejects testnet peer route stanzas during a BSC mainnet audit", () => {
    const report = evaluateBscSccpPeerConfigAudit(
      peerConfigs([routeToml(), routeToml()]),
      { expectedPeers: 2, bscNetwork: "mainnet" },
    );

    expect(report.ready).toBe(false);
    expect(report.bsc).toMatchObject({
      network: "mainnet",
      chain: "bsc-mainnet",
      chainIdHex: "0x38",
      networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
    });
    expect(report.peers.map((peer) => peer.routeCount)).toEqual([1, 1]);
    expect(report.manifestFingerprint).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(failedCheck(report, "peer-route-count")?.detail).toContain(
      "peer0.toml: 1",
    );
  });

  it("rejects route metadata drift even when deployment material still matches", () => {
    const report = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml({
          verifier_target: "EvmContract",
          counterparty_account_codec_key: "evm_hex",
          counterparty_account_codec: 2,
        }),
        routeToml({
          verifier_target: "LegacyEvmContract",
          counterparty_account_codec_key: "evm_hex",
          counterparty_account_codec: 2,
        }),
        routeToml({
          version: 2,
          verifier_target: "EvmContract",
          counterparty_account_codec_key: "evm_hex",
          counterparty_account_codec: 2,
        }),
      ]),
      { expectedPeers: 3 },
    );

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "peer-route-count")?.detail).toContain(
      "peer0.toml: 1",
    );
    expect(
      failedCheck(report, "peer-route-production-readiness")?.detail,
    ).toContain("peer-route-stale-override");
    expect(failedCheck(report, "peer-route-consistency")?.detail).toContain(
      "peer0.toml",
    );
    expect(failedCheck(report, "peer-route-consistency")?.detail).toContain(
      "peer1.toml",
    );
    expect(failedCheck(report, "peer-route-consistency")?.detail).toContain(
      "peer2.toml",
    );
  });

  it("rejects local native prover bundle hash overrides as stale route material", () => {
    const missing = evaluateBscSccpPeerConfigAudit(
      peerConfigs([routeToml({ native_evm_prover_bundle_hash: undefined })]),
    );

    expect(missing.ready).toBe(false);
    expect(failedCheck(missing, "peer-route-count")?.detail).toContain(
      "peer0.toml: 1",
    );

    const drift = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml(),
        routeToml({ native_evm_prover_bundle_hash: HASH_11 }),
      ]),
      { expectedPeers: 2 },
    );

    expect(drift.ready).toBe(false);
    expect(failedCheck(drift, "peer-route-consistency")?.detail).toContain(
      "peer0.toml",
    );
    expect(failedCheck(drift, "peer-route-consistency")?.detail).toContain(
      "peer1.toml",
    );
  });

  it("publishes structured missing inputs for non-production peer route material", () => {
    const report = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml({
          production_ready: false,
          verifier_key_hash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
          proof_artifact_hash: undefined,
          proving_key_hash: undefined,
          native_evm_prover_bundle_hash: undefined,
          post_deploy_offline_full_toml_sha256: undefined,
        }),
      ]),
      { expectedPeers: 1 },
    );

    expect(report.ready).toBe(false);
    expect(report.nextActions.map((action) => action.id)).toEqual([
      "refresh-peer-config-audit-source",
      "remove-stale-peer-route-overrides",
    ]);
    expect(report.nextActions[1]).toMatchObject({
      id: "remove-stale-peer-route-overrides",
      blockedByChecks: expect.arrayContaining([
        "peer-route-production-readiness",
      ]),
      requiredInputs: expect.arrayContaining([
        expect.objectContaining({ id: "taira-peer-config-targets" }),
        expect.objectContaining({ id: "peer-config-audit-source" }),
      ]),
    });
    expect(report.nextActions[1].commands[0]).toContain(
      "npm run e2e:sccp:bsc-peer-config-audit",
    );
    expect(report.missingProductionInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "taira-peer-config-targets",
          blockedByActions: ["remove-stale-peer-route-overrides"],
        }),
      ]),
    );
    expect(JSON.stringify(report)).not.toMatch(/private|seed|mnemonic/iu);
  });

  it("rejects peer stanzas whose cryptographic role hashes collide", () => {
    const report = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml({
          proof_artifact_hash: HASH_22,
        }),
      ]),
    );

    expect(report.ready).toBe(false);
    expect(
      failedCheck(report, "peer-route-hash-role-separation")?.detail,
    ).toMatch(/peer0\.toml: proofArtifactHash must not equal verifierKeyHash/u);
    expect(
      failedCheck(report, "peer-route-production-readiness")?.detail,
    ).toContain("proofArtifactHash must not equal verifierKeyHash");
  });

  it("rejects duplicate native prover bundle hash aliases in peer stanzas", () => {
    const report = evaluateBscSccpPeerConfigAudit(
      peerConfigs([routeToml({ nativeEvmProverBundleHash: HASH_99 })]),
    );

    expect(report.ready).toBe(false);
    expect(
      failedCheck(report, "peer-route-production-readiness")?.detail,
    ).toMatch(/native EVM prover bundle hash must not use multiple aliases/u);
  });

  it("rejects missing or placeholder TAIRA burn-record material in peer stanzas", () => {
    const missing = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml({
          taira_burn_record_contract_artifact_b64: undefined,
        }),
      ]),
    );
    expect(missing.ready).toBe(false);
    expect(
      failedCheck(missing, "peer-route-burn-record-material")?.detail,
    ).toContain("contractArtifactB64 is missing");

    const repeatedBytes = Buffer.alloc(512, 7);
    const repeated = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml({
          taira_burn_record_contract_artifact_b64:
            repeatedBytes.toString("base64"),
          taira_burn_record_artifact_sha256: sha256Hex(repeatedBytes),
        }),
      ]),
    );
    expect(repeated.ready).toBe(false);
    expect(
      failedCheck(repeated, "peer-route-burn-record-material")?.detail,
    ).toMatch(/placeholder burn-record material.*repeated/u);

    const mismatch = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml({
          taira_burn_record_artifact_sha256: HASH_11,
        }),
      ]),
    );
    expect(mismatch.ready).toBe(false);
    expect(
      failedCheck(mismatch, "peer-route-burn-record-material")?.detail,
    ).toContain("artifactSha256 does not match contractArtifactB64");
  });

  it("rejects duplicate TAIRA burn-record aliases in peer stanzas", () => {
    expect(() =>
      evaluateBscSccpPeerConfigAudit(
        peerConfigs([routeToml({ contractArtifactB64: ARTIFACT_B64 })]),
      ),
    ).toThrow(/TAIRA burn-record contract artifact.*multiple aliases/u);
  });

  it("rejects duplicate post-deploy evidence aliases in peer stanzas", () => {
    expect(() =>
      evaluateBscSccpPeerConfigAudit(
        peerConfigs([routeToml({ postDeployFullTomlReady: true })]),
      ),
    ).toThrow(/post-deploy full TOML readiness must not use multiple aliases/u);

    expect(() =>
      evaluateBscSccpPeerConfigAudit(
        peerConfigs([routeToml({ routeCanaryEvidenceHash: HASH_66 })]),
      ),
    ).toThrow(
      /post-deploy route canary evidence hash must not use multiple aliases/u,
    );

    expect(() =>
      evaluateBscSccpPeerConfigAudit(
        peerConfigs([
          routeToml({ routeCanaryTransactionUrl: ROUTE_CANARY_EXPLORER_URL }),
        ]),
      ),
    ).toThrow(
      /post-deploy route canary explorer URL must not use multiple aliases/u,
    );
  });

  it("rejects duplicate route identity aliases in peer stanzas", () => {
    expect(() =>
      evaluateBscSccpPeerConfigAudit(
        peerConfigs([routeToml({ routeId: "taira_bsc_xor" })]),
      ),
    ).toThrow(/route id must not use multiple aliases/u);

    expect(() =>
      evaluateBscSccpPeerConfigAudit(
        peerConfigs([routeToml({ assetKey: "xor" })]),
      ),
    ).toThrow(/asset key must not use multiple aliases/u);
  });

  it("rejects duplicate same-key peer TOML assignments before alias normalization", () => {
    expect(() =>
      parseSccpRouteManifestStanzas(
        `${routeToml()}production_ready = false\n`,
        "peer0.toml",
      ),
    ).toThrow(/duplicate TOML key production_ready/u);

    expect(() =>
      parseSccpRouteManifestStanzas(
        `${routeToml()}verifier_key_hash = "${HASH_77}"\n`,
        "peer0.toml",
      ),
    ).toThrow(/duplicate TOML key verifier_key_hash/u);
  });

  it("rejects non-plain peer stanza objects before inherited route fields can match", () => {
    const inheritedValidRoute = parseSccpRouteManifestStanzas(
      routeToml(),
      "polluted-peer.toml",
    )[0];
    const pollutedStanza = Object.create(inheritedValidRoute);
    pollutedStanza.__source = "polluted-peer.toml";
    pollutedStanza.__line = 1;

    expect(() =>
      evaluateBscSccpPeerConfigAudit(
        peerConfigs([routeToml()]).map((peer) => ({
          ...peer,
          stanzas: [pollutedStanza],
        })),
      ),
    ).toThrow(/peer route stanza must be a plain object/u);
  });

  it("ignores polluted Object.prototype fields when matching peer route stanzas", () => {
    const validRoute = parseSccpRouteManifestStanzas(
      routeToml(),
      "polluted-peer.toml",
    )[0];
    const pollutedKeys = Object.entries(validRoute).filter(
      ([key]) => !key.startsWith("__"),
    );
    const previousDescriptors = new Map(
      pollutedKeys.map(([key]) => [
        key,
        Object.getOwnPropertyDescriptor(Object.prototype, key),
      ]),
    );
    let report;

    try {
      for (const [key, value] of pollutedKeys) {
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          enumerable: false,
          writable: true,
          value,
        });
      }

      report = evaluateBscSccpPeerConfigAudit(
        [
          {
            source: "polluted-peer.toml",
            stanzas: [{ __source: "polluted-peer.toml", __line: 1 }],
          },
        ],
        { expectedPeers: 1 },
      );
    } finally {
      for (const [key, descriptor] of previousDescriptors) {
        if (descriptor) {
          Object.defineProperty(Object.prototype, key, descriptor);
        } else {
          delete Object.prototype[key];
        }
      }
    }

    expect(report.ready).toBe(true);
    expect(report.peerCount).toBe(1);
    expect(report.manifestFingerprint).toBeNull();
    expect(report.peers[0].routeCount).toBe(0);
    expect(report.peers[0].deployment).toBeNull();
    expect(failedCheck(report, "peer-route-count")).toBeUndefined();
  });

  it("ignores inherited peer evidence fields before matching route stanzas", () => {
    const inheritedPeer = peerConfigs([routeToml()])[0];
    inheritedPeer.rawTomlSha256 = HASH_88;
    const pollutedPeer = Object.create(inheritedPeer);

    const report = evaluateBscSccpPeerConfigAudit([pollutedPeer], {
      expectedPeers: 1,
    });

    expect(report.ready).toBe(false);
    expect(report.peerCount).toBe(1);
    expect(report.manifestFingerprint).toBeNull();
    expect(report.peers[0]).toMatchObject({
      source: "peer0",
      rawTomlSha256: null,
      routeCount: 0,
      deployment: null,
      postDeployLiveEvidence: null,
      ready: true,
    });
    expect(failedCheck(report, "peer-route-count")).toBeUndefined();
  });

  it("does not invoke accessor-backed peer metadata while auditing routes", () => {
    const sourceGetter = vi.fn(() => "forged-peer.toml");
    const rawHashGetter = vi.fn(() => HASH_88);
    const peer = {
      stanzas: parseSccpRouteManifestStanzas(routeToml(), "peer0.toml"),
    };
    Object.defineProperty(peer, "source", {
      configurable: true,
      enumerable: true,
      get: sourceGetter,
    });
    Object.defineProperty(peer, "rawTomlSha256", {
      configurable: true,
      enumerable: true,
      get: rawHashGetter,
    });

    const report = evaluateBscSccpPeerConfigAudit([peer], {
      expectedPeers: 1,
    });

    expect(sourceGetter).not.toHaveBeenCalled();
    expect(rawHashGetter).not.toHaveBeenCalled();
    expect(report.ready).toBe(false);
    expect(report.peerCount).toBe(1);
    expect(report.peers[0]).toMatchObject({
      source: "peer0",
      rawTomlSha256: null,
      routeCount: 1,
      ready: false,
    });
  });

  it("does not invoke accessor-backed peer stanza collections", () => {
    const stanzasGetter = vi.fn(() =>
      parseSccpRouteManifestStanzas(routeToml(), "forged-peer.toml"),
    );
    const peer = { source: "peer0.toml" };
    Object.defineProperty(peer, "stanzas", {
      configurable: true,
      enumerable: true,
      get: stanzasGetter,
    });

    const report = evaluateBscSccpPeerConfigAudit([peer], {
      expectedPeers: 1,
    });

    expect(stanzasGetter).not.toHaveBeenCalled();
    expect(report.ready).toBe(true);
    expect(report.peers[0]).toMatchObject({
      source: "peer0.toml",
      routeCount: 0,
      manifestFingerprint: null,
      deployment: null,
      postDeployLiveEvidence: null,
    });
    expect(failedCheck(report, "peer-route-count")).toBeUndefined();
  });

  it("does not invoke accessor-backed peer route stanza fields", () => {
    const routeIdGetter = vi.fn(() => "taira_bsc_xor");
    const stanza = parseSccpRouteManifestStanzas(routeToml(), "peer0.toml")[0];
    Object.defineProperty(stanza, "route_id", {
      configurable: true,
      enumerable: true,
      get: routeIdGetter,
    });

    const report = evaluateBscSccpPeerConfigAudit([
      {
        source: "peer0.toml",
        stanzas: [stanza],
      },
    ]);

    expect(routeIdGetter).not.toHaveBeenCalled();
    expect(report.ready).toBe(true);
    expect(report.peers[0]).toMatchObject({
      routeCount: 0,
      manifestFingerprint: null,
      deployment: null,
      postDeployLiveEvidence: null,
    });
    expect(failedCheck(report, "peer-route-count")).toBeUndefined();
  });

  it("does not invoke accessor-backed peer or stanza array indexes", () => {
    const peerGetter = vi.fn(() => peerConfigs([routeToml()])[0]);
    const stanzaGetter = vi.fn(
      () => parseSccpRouteManifestStanzas(routeToml(), "forged-peer.toml")[0],
    );
    const peerRows = [];
    Object.defineProperty(peerRows, "0", {
      configurable: true,
      enumerable: true,
      get: peerGetter,
    });
    const stanzas = [];
    Object.defineProperty(stanzas, "0", {
      configurable: true,
      enumerable: true,
      get: stanzaGetter,
    });

    const noPeerReport = evaluateBscSccpPeerConfigAudit(peerRows);
    const noStanzaReport = evaluateBscSccpPeerConfigAudit([
      {
        source: "peer0.toml",
        stanzas,
      },
    ]);

    expect(peerGetter).not.toHaveBeenCalled();
    expect(stanzaGetter).not.toHaveBeenCalled();
    expect(noPeerReport.peerCount).toBe(0);
    expect(noPeerReport.ready).toBe(false);
    expect(noStanzaReport.peerCount).toBe(1);
    expect(noStanzaReport.peers[0].routeCount).toBe(0);
    expect(noStanzaReport.ready).toBe(false);
    expect(failedCheck(noPeerReport, "peer-config-files")?.detail).toContain(
      "peer config 0 is missing or accessor-backed",
    );
    expect(noStanzaReport.peers[0].failedChecks).toContainEqual(
      expect.objectContaining({
        id: "peer-route-stanza-shape",
        detail: "peer0.toml route stanza 0 is missing or accessor-backed.",
      }),
    );
    expect(
      failedCheck(noStanzaReport, "peer-route-production-readiness")?.detail,
    ).toContain("peer-route-stanza-shape");
  });

  it("fails closed on sparse peer and stanza arrays without invoking accessors", () => {
    const peerGetter = vi.fn(() => peerConfigs([routeToml()])[0]);
    const stanzaGetter = vi.fn(
      () => parseSccpRouteManifestStanzas(routeToml(), "forged-peer.toml")[0],
    );
    const peerRows = [peerConfigs([routeToml()])[0]];
    peerRows.length = 3;
    Object.defineProperty(peerRows, "2", {
      configurable: true,
      enumerable: true,
      get: peerGetter,
    });
    const sparsePeerReport = evaluateBscSccpPeerConfigAudit(peerRows);

    const stanzas = parseSccpRouteManifestStanzas(routeToml(), "peer0.toml");
    stanzas.length = 3;
    Object.defineProperty(stanzas, "2", {
      configurable: true,
      enumerable: true,
      get: stanzaGetter,
    });
    const sparseStanzaReport = evaluateBscSccpPeerConfigAudit([
      {
        source: "peer0.toml",
        stanzas,
      },
    ]);

    expect(peerGetter).not.toHaveBeenCalled();
    expect(stanzaGetter).not.toHaveBeenCalled();
    expect(sparsePeerReport.peerCount).toBe(1);
    expect(sparsePeerReport.ready).toBe(false);
    expect(
      failedCheck(sparsePeerReport, "peer-config-files")?.detail,
    ).toContain("peer config 1 is missing or accessor-backed");
    expect(
      failedCheck(sparsePeerReport, "peer-config-files")?.detail,
    ).toContain("peer config 2 is missing or accessor-backed");
    expect(sparseStanzaReport.peerCount).toBe(1);
    expect(sparseStanzaReport.peers[0].routeCount).toBe(1);
    expect(sparseStanzaReport.peers[0].ready).toBe(false);
    expect(sparseStanzaReport.ready).toBe(false);
    expect(sparseStanzaReport.peers[0].failedChecks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "peer-route-stanza-shape",
          detail: "peer0.toml route stanza 1 is missing or accessor-backed.",
        }),
        expect.objectContaining({
          id: "peer-route-stanza-shape",
          detail: "peer0.toml route stanza 2 is missing or accessor-backed.",
        }),
      ]),
    );
    expect(
      failedCheck(sparseStanzaReport, "peer-route-production-readiness")
        ?.detail,
    ).toContain("peer-route-stanza-shape");
  });

  it("rejects duplicate route metadata aliases in peer stanzas", () => {
    for (const [label, override, reason] of [
      [
        "productionReady",
        { productionReady: true },
        /production-ready status must not use multiple aliases/u,
      ],
      [
        "chainIdHex",
        { chainIdHex: "0x61" },
        /chain id must not use multiple aliases/u,
      ],
      [
        "counterpartyDomain",
        { counterpartyDomain: 2 },
        /counterparty domain must not use multiple aliases/u,
      ],
      [
        "codec key",
        {
          counterparty_account_codec_key: "evm_hex",
          counterpartyAccountCodecKey: "evm_hex",
        },
        /counterparty account codec key must not use multiple aliases/u,
      ],
      [
        "codec id",
        { counterparty_account_codec: 2, counterpartyAccountCodec: 2 },
        /counterparty account codec must not use multiple aliases/u,
      ],
      [
        "source domain",
        { source_domain: 0, sourceDomain: 0 },
        /destination source domain must not use multiple aliases/u,
      ],
      [
        "target domain",
        { target_domain: 2, targetDomain: 2 },
        /destination target domain must not use multiple aliases/u,
      ],
    ]) {
      expect(
        () =>
          evaluateBscSccpPeerConfigAudit(peerConfigs([routeToml(override)])),
        label,
      ).toThrow(reason);
    }
  });

  it("rejects duplicate BSC address aliases in peer stanzas", () => {
    for (const [label, override, reason] of [
      [
        "token",
        { tokenAddress: BSC_TOKEN_ADDRESS },
        /BSC token address must not use multiple aliases/u,
      ],
      [
        "bridge",
        { bridgeAddress: BSC_BRIDGE_ADDRESS },
        /BSC bridge address must not use multiple aliases/u,
      ],
      [
        "source bridge",
        { sccp_tron_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS },
        /BSC source bridge address must not use multiple aliases/u,
      ],
      [
        "verifier",
        { tron_verifier_address: BSC_VERIFIER_ADDRESS },
        /BSC verifier address must not use multiple aliases/u,
      ],
    ]) {
      expect(
        () =>
          evaluateBscSccpPeerConfigAudit(peerConfigs([routeToml(override)])),
        label,
      ).toThrow(reason);
    }
  });

  it("rejects BSC peer route stanzas that use only legacy TRON address fields", () => {
    const report = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml({
          sccp_bsc_source_bridge_address: undefined,
          sccp_bsc_destination_verifier_address: undefined,
          sccp_tron_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
          tron_verifier_address: BSC_VERIFIER_ADDRESS,
        }),
      ]),
    );

    expect(report.ready).toBe(false);
    expect(report.peers[0].failedChecks).toContainEqual(
      expect.objectContaining({
        id: "bsc-sourceBridge-address",
        detail: expect.stringContaining("sccp_tron_source_bridge_address"),
      }),
    );
    expect(report.peers[0].failedChecks).toContainEqual(
      expect.objectContaining({
        id: "bsc-verifier-address",
        detail: expect.stringContaining("tron_verifier_address"),
      }),
    );
    expect(
      failedCheck(report, "peer-route-production-readiness")?.detail,
    ).toContain("must not use TRON aliases");
  });

  it("does not copy rejected legacy TRON aliases into sanitized BSC peer snapshots", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const peerFile = path.join(dir, "peer0.toml");
    const sanitizedDir = path.join(dir, "sanitized");
    await writeFile(
      peerFile,
      routeToml({
        sccp_bsc_source_bridge_address: undefined,
        sccp_bsc_destination_verifier_address: undefined,
        sccp_tron_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
        tron_verifier_address: BSC_VERIFIER_ADDRESS,
      }),
      "utf8",
    );

    const report = await runBscSccpPeerConfigAudit({
      files: [peerFile],
      expectedPeers: 1,
      sanitizedStanzasDir: sanitizedDir,
    });

    expect(report.ready).toBe(false);
    expect(report.sanitizedStanzaFilesChecked).toBe(true);
    expect(
      failedCheck(report, "peer-route-production-readiness")?.detail,
    ).toContain("must not use TRON aliases");
    const sanitized = await readFile(
      path.join(sanitizedDir, "peer0-peer0.toml"),
      "utf8",
    );
    expect(sanitized).toContain("[[zk.sccp_route_manifests]]");
    expect(sanitized).not.toContain("sccp_tron_source_bridge_address");
    expect(sanitized).not.toContain("sccp_tron_destination_verifier_address");
    expect(sanitized).not.toContain("tron_source_bridge_address");
    expect(sanitized).not.toContain("tron_verifier_address");
  });

  it("rejects disabled diagnostic peer stanzas as not production-ready", () => {
    const report = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml({
          production_ready: false,
          disabled_reason:
            "BSC verifier material is diagnostic and must be replaced before production readiness.",
          verifier_key_hash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
          proving_key_hash: undefined,
          proof_artifact_hash: undefined,
        }),
      ]),
    );

    expect(report.ready).toBe(false);
    expect(
      failedCheck(report, "peer-route-production-readiness")?.detail,
    ).toMatch(/diagnostic|proofArtifactHash|production-ready/u);
    expect(report.peers[0].failedChecks).toContainEqual(
      expect.objectContaining({
        id: "bsc-production-verifier-material",
        ok: false,
        status: "fail",
      }),
    );
  });

  it("rejects production peer stanzas that hide diagnostic verifier hashes behind camelCase aliases", () => {
    const report = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml({
          verifier_key_hash: undefined,
          verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
        }),
      ]),
    );

    expect(report.ready).toBe(false);
    expect(report.peers[0].failedChecks).toContainEqual(
      expect.objectContaining({
        id: "bsc-production-verifier-material",
        ok: false,
        status: "fail",
        detail: expect.stringContaining(
          "known diagnostic BSC verifier key hash",
        ),
      }),
    );
    expect(
      failedCheck(report, "peer-route-production-readiness")?.detail,
    ).toContain("known diagnostic BSC verifier key hash");
  });

  it("rejects peer stanzas that provide multiple verifier key hash aliases", () => {
    expect(() =>
      evaluateBscSccpPeerConfigAudit(
        peerConfigs([
          routeToml({
            verifierKeyHash: HASH_77,
          }),
        ]),
      ),
    ).toThrow(/BSC verifier key hash.*multiple aliases/u);
  });

  it("rejects production peer stanzas that still carry disabled reasons", () => {
    const report = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml({
          production_ready: true,
          disabled_reason: "operator left this route disabled",
        }),
      ]),
    );

    expect(report.ready).toBe(false);
    expect(report.peers[0].failedChecks).toContainEqual(
      expect.objectContaining({
        id: "bsc-production-disabled-conflict",
        detail: expect.stringContaining("operator left this route disabled"),
      }),
    );
    expect(
      failedCheck(report, "peer-route-production-readiness")?.detail,
    ).toContain("bsc-production-disabled-conflict");
  });

  it("rejects production peer stanzas without explicit post-deploy explorer and config-hash evidence", () => {
    const report = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml({
          post_deploy_source_event_explorer_url: undefined,
          post_deploy_route_canary_explorer_url: undefined,
          post_deploy_offline_full_toml_sha256: undefined,
        }),
      ]),
    );

    expect(report.ready).toBe(false);
    expect(report.peers[0].failedChecks).toContainEqual(
      expect.objectContaining({
        id: "bsc-post-deploy-live-evidence",
        detail: expect.stringContaining("offlineFullTomlSha256 is required"),
      }),
    );
    expect(report.peers[0].failedChecks).toContainEqual(
      expect.objectContaining({
        id: "bsc-post-deploy-live-evidence",
        detail: expect.stringContaining("sourceEventExplorerUrl is required"),
      }),
    );
    expect(report.peers[0].failedChecks).toContainEqual(
      expect.objectContaining({
        id: "bsc-post-deploy-live-evidence",
        detail: expect.stringContaining("routeCanaryExplorerUrl is required"),
      }),
    );
  });

  it("rejects disabled peer stanzas that claim full TOML readiness without a config hash", () => {
    const report = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml({
          production_ready: false,
          disabled_reason:
            "BSC verifier material is diagnostic and must be replaced before production readiness.",
          verifier_key_hash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
          proof_artifact_hash: undefined,
          proving_key_hash: undefined,
          native_evm_prover_bundle_hash: undefined,
          post_deploy_full_toml_ready: true,
          post_deploy_offline_full_toml_sha256: undefined,
        }),
      ]),
    );

    expect(report.ready).toBe(false);
    expect(report.peers[0].failedChecks).toContainEqual(
      expect.objectContaining({
        id: "bsc-post-deploy-live-evidence",
        detail: expect.stringContaining("offlineFullTomlSha256 is required"),
      }),
    );
  });

  it("rejects production peer stanzas that point at the wrong BSC chain id", () => {
    const report = evaluateBscSccpPeerConfigAudit(
      peerConfigs([routeToml({ chain_id_hex: "0x38" })]),
    );

    expect(report.ready).toBe(false);
    expect(report.peers[0].routeCount).toBe(1);
    expect(report.peers[0].failedChecks).toContainEqual(
      expect.objectContaining({ id: "peer-route-stale-override" }),
    );
    expect(failedCheck(report, "peer-route-count")?.detail).toContain(
      "peer0.toml: 1",
    );
  });

  it("does not treat absent legacy post-deploy TOML URL fields as explicit empty URLs on disabled stanzas", () => {
    const report = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml({
          production_ready: false,
          disabled_reason: "Disabled legacy route draft.",
          post_deploy_source_event_explorer_url: undefined,
          post_deploy_route_canary_explorer_url: undefined,
        }),
      ]),
    );

    expect(report.ready).toBe(false);
    expect(report.peers[0].failedChecks).toContainEqual(
      expect.objectContaining({ id: "bsc-production-ready" }),
    );
    expect(report.peers[0].failedChecks).not.toContainEqual(
      expect.objectContaining({ id: "bsc-post-deploy-live-evidence" }),
    );
  });

  it("redacts secret-like peer stanza fields from audit reports", () => {
    const report = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml({
          operator_notes: VALID_MNEMONIC,
          private_key: "do-not-serialize",
          api_key: "do-not-serialize-api-key",
        }),
      ]),
    );

    expect(report.ready).toBe(false);
    expect(report.peers[0].failedChecks).toContainEqual(
      expect.objectContaining({ id: "bsc-manifest-secret-scan" }),
    );
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("operator_notes");
    expect(serialized).not.toContain("private_key");
    expect(serialized).not.toContain("api_key");
    expect(serialized).not.toContain("abandon abandon");
    expect(serialized).not.toContain("do-not-serialize");
    expect(serialized).not.toContain("do-not-serialize-api-key");
  });

  it("rejects assignment-shaped secrets in unknown peer route fields without serializing them", () => {
    const secretNote =
      "operator rotated privateKey=0xfeedface accessToken=0xfeedface before restart";
    const report = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml({
          audit_notes: secretNote,
        }),
      ]),
    );

    expect(report.ready).toBe(false);
    expect(report.peers[0].failedChecks).toContainEqual(
      expect.objectContaining({ id: "bsc-manifest-secret-scan" }),
    );
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("audit_notes");
    expect(serialized).not.toContain("privateKey=");
    expect(serialized).not.toContain("accessToken=");
    expect(serialized).not.toContain("feedface");
  });

  it("rejects bearer-token-shaped secrets in unknown peer route fields without serializing them", () => {
    const secretNote =
      "operator pasted Bearer mF9x8Y7z6W5v4U3t2S1r0Q9p8O7n6M5l before restart";
    const report = evaluateBscSccpPeerConfigAudit(
      peerConfigs([
        routeToml({
          audit_notes: secretNote,
        }),
      ]),
    );

    expect(report.ready).toBe(false);
    expect(report.peers[0].failedChecks).toContainEqual(
      expect.objectContaining({ id: "bsc-manifest-secret-scan" }),
    );
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("audit_notes");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("mF9x8Y7z6W5v4U3t2S1r0Q9p8O7n6M5l");
  });

  it("reads peer*.toml files from a directory without including backups by default", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    await writeFile(path.join(dir, "peer0.toml"), routeToml(), "utf8");
    await writeFile(path.join(dir, "peer1.toml"), routeToml(), "utf8");
    await writeFile(
      path.join(dir, "peer1.toml.bak-old"),
      routeToml({ production_ready: false }),
      "utf8",
    );

    const report = await runBscSccpPeerConfigAudit({
      dir,
      expectedPeers: 2,
    });

    expect(report.ready).toBe(false);
    expect(report.sanitizedStanzaFilesChecked).toBe(false);
    expect(report.peerCount).toBe(2);
    expect(report.peers[0].rawTomlSha256).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(report.peers[0].sanitizedStanzaSha256).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(failedCheck(report, "peer-raw-toml-hashes")).toBeUndefined();
    expect(report.peers.map((peer) => path.basename(peer.source))).toEqual([
      "peer0.toml",
      "peer1.toml",
    ]);
  });

  it("prefers exact expected peer files over stale generated stanza snapshots", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    await writeFile(path.join(dir, "peer0.toml"), routeToml(), "utf8");
    await writeFile(path.join(dir, "peer1.toml"), routeToml(), "utf8");
    await writeFile(
      path.join(dir, "peer0-peer0.toml"),
      routeToml({
        verifier_key_hash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
        production_ready: false,
        disabled_reason: "stale generated snapshot",
      }),
      "utf8",
    );
    await writeFile(
      path.join(dir, "peer1-peer1.toml"),
      routeToml({
        source_bridge_address: fixtureAddress("stale generated source bridge"),
      }),
      "utf8",
    );

    const report = await runBscSccpPeerConfigAudit({
      dir,
      expectedPeers: 2,
    });

    expect(report.ready).toBe(false);
    expect(report.peerCount).toBe(2);
    expect(report.peers.map((peer) => path.basename(peer.source))).toEqual([
      "peer0.toml",
      "peer1.toml",
    ]);
    expect(JSON.stringify(report)).not.toContain("stale generated snapshot");
  });

  it("does not follow symlinked peer TOML files from directory scans", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const outside = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-peer-audit-outside-"),
    );
    await writeFile(path.join(dir, "peer0.toml"), routeToml(), "utf8");
    await writeFile(
      path.join(outside, "peer1.toml"),
      [
        'private_key = "must-not-be-read"',
        routeToml({ audit_notes: "privateKey=0xfeedface" }),
      ].join("\n"),
      "utf8",
    );
    await symlink(
      path.join(outside, "peer1.toml"),
      path.join(dir, "peer1.toml"),
    );

    const report = await runBscSccpPeerConfigAudit({
      dir,
      expectedPeers: 1,
    });

    expect(report.ready).toBe(false);
    expect(report.peerCount).toBe(1);
    expect(report.peers.map((peer) => path.basename(peer.source))).toEqual([
      "peer0.toml",
    ]);
    expect(JSON.stringify(report)).not.toContain("must-not-be-read");
    expect(JSON.stringify(report)).not.toContain("feedface");
  });

  it("rejects explicit peer TOML symlinks before parsing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const outside = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-peer-audit-outside-"),
    );
    const linkPath = path.join(dir, "peer0.toml");
    await writeFile(path.join(outside, "peer0.toml"), routeToml(), "utf8");
    await symlink(path.join(outside, "peer0.toml"), linkPath);

    await expect(
      runBscSccpPeerConfigAudit({
        files: [linkPath],
        expectedPeers: 1,
      }),
    ).rejects.toThrow(/symbolic link/u);
  });

  it("rejects oversized explicit peer TOML files before parsing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const peerFile = path.join(dir, "peer0.toml");
    await writeFile(peerFile, "");
    await truncate(peerFile, SCCP_BSC_PEER_CONFIG_TOML_MAX_BYTES + 1);

    await expect(
      runBscSccpPeerConfigAudit({
        files: [peerFile],
        expectedPeers: 1,
      }),
    ).rejects.toThrow(/maximum allowed/u);
  });

  it("writes route-only sanitized snapshots without retaining validator secrets", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const peerFile = path.join(dir, "peer0.toml");
    const sanitizedDir = path.join(dir, "sanitized");
    const rawPeerToml = [
      'private_key = "validator-private-key-must-not-persist"',
      "[network]",
      'identity_private_key = "node-identity-secret-must-not-persist"',
      routeToml(),
    ].join("\n");
    await writeFile(peerFile, rawPeerToml, "utf8");

    const report = await runBscSccpPeerConfigAudit({
      files: [peerFile],
      expectedPeers: 1,
      sanitizedStanzasDir: sanitizedDir,
    });

    expect(report.ready).toBe(false);
    expect(report.sanitizedStanzaFilesChecked).toBe(true);
    expect(report.peers[0].rawTomlSha256).toBe(sha256Hex(rawPeerToml));
    expect(path.basename(report.peers[0].source)).toBe("peer0.toml");
    const sanitized = await readFile(
      path.join(sanitizedDir, "peer0-peer0.toml"),
      "utf8",
    );
    expect(report.peers[0].sanitizedStanzaSha256).toBe(sha256Hex(sanitized));
    expectSanitizedFileEvidence(report.peers[0], sanitized, "peer0-peer0.toml");
    expect(sanitized).toContain("[[zk.sccp_route_manifests]]");
    expect(sanitized).toContain('route_id = "taira_bsc_xor"');
    expect(sanitized).toContain(`native_evm_prover_bundle_hash = "${HASH_99}"`);
    expect(sanitized).not.toContain("[network]");
    expect(sanitized).not.toContain("private_key");
    expect(sanitized).not.toContain("identity_private_key");
    expect(sanitized).not.toContain("validator-private-key");
    expect(sanitized).not.toContain("node-identity-secret");

    const replayed = await runBscSccpPeerConfigAudit({
      dir: sanitizedDir,
      expectedPeers: 1,
    });
    expect(replayed.ready).toBe(false);
    expect(replayed.sanitizedStanzaFilesChecked).toBe(false);
    expect(replayed.peers[0].rawTomlSha256).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(replayed.peers[0].sanitizedStanzaSha256).toBe(sha256Hex(sanitized));
  });

  it("publishes report-relative sanitized stanza sources when a report output directory is provided", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const rawDir = path.join(dir, "raw");
    const reportDir = path.join(dir, "report");
    const sanitizedDir = path.join(reportDir, "stanzas");
    const peerFile = path.join(rawDir, "peer0.toml");
    await mkdir(rawDir, { recursive: true });
    await writeFile(peerFile, routeToml(), "utf8");

    const report = await runBscSccpPeerConfigAudit({
      files: [peerFile],
      expectedPeers: 1,
      sanitizedStanzasDir: sanitizedDir,
      reportOutputDir: reportDir,
    });

    const sanitizedFile = path.join(sanitizedDir, "peer0-peer0.toml");
    const sanitized = await readFile(sanitizedFile, "utf8");
    expect(report.ready).toBe(false);
    expect(report.sanitizedStanzaFilesChecked).toBe(true);
    expect(report.peers[0].sanitizedStanzaSource).toBe(
      "stanzas/peer0-peer0.toml",
    );
    expect(report.peers[0].sanitizedStanzaFileSha256).toBe(
      sha256Hex(sanitized),
    );
  });

  it("defaults CLI sanitized snapshots under the output report directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const rawDir = path.join(dir, "raw");
    const reportDir = path.join(dir, "report");
    const peerFile = path.join(rawDir, "peer0.toml");
    await mkdir(rawDir, { recursive: true });
    await writeFile(peerFile, routeToml(), "utf8");
    const scriptPath = path.join(
      process.cwd(),
      "scripts/e2e/sccp-bsc-peer-config-audit.mjs",
    );
    const env = { ...process.env };
    delete env.SCCP_BSC_PEER_AUDIT_OUTPUT_DIR;
    delete env.SCCP_BSC_PEER_AUDIT_SANITIZED_STANZAS_DIR;
    delete env.SCCP_BSC_PEER_AUDIT_SSH_HOST;
    delete env.SCCP_BSC_PEER_AUDIT_SSH_CREDS_FILE;
    delete env.SCCP_BSC_PEER_AUDIT_SSH_PASSWORD;
    delete env.SCCP_BSC_PEER_AUDIT_SSH_PASSWORD_FILE;

    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "--dir",
        rawDir,
        "--output-dir",
        reportDir,
        "--expected-peers",
        "1",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env,
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(1);
    const latest = JSON.parse(
      await readFile(path.join(reportDir, "latest.json"), "utf8"),
    );
    const sanitized = await readFile(
      path.join(reportDir, "stanzas", "peer0-peer0.toml"),
      "utf8",
    );
    expect(latest.ready).toBe(false);
    expect(latest.generatedAt).toBe(
      new Date(latest.generatedAtMs).toISOString(),
    );
    expect(latest.sanitizedStanzaFilesChecked).toBe(true);
    expect(latest.peers[0].sanitizedStanzaSource).toBe(
      "stanzas/peer0-peer0.toml",
    );
    expect(latest.peers[0].sanitizedStanzaFileSha256).toBe(
      sha256Hex(sanitized),
    );
  });

  it("rejects local peer sources when remote audit source is configured by environment", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const rawDir = path.join(dir, "raw");
    const reportDir = path.join(dir, "report");
    await mkdir(rawDir, { recursive: true });
    await writeFile(path.join(rawDir, "peer0.toml"), routeToml(), "utf8");
    const scriptPath = path.join(
      process.cwd(),
      "scripts/e2e/sccp-bsc-peer-config-audit.mjs",
    );
    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "--dir",
        rawDir,
        "--output-dir",
        reportDir,
        "--expected-peers",
        "1",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          SCCP_BSC_PEER_AUDIT_SSH_HOST: "ops@taira.example",
          SCCP_BSC_PEER_AUDIT_SSH_CREDS_FILE: "",
          SCCP_BSC_PEER_AUDIT_OUTPUT_DIR: "",
          SCCP_BSC_PEER_AUDIT_SANITIZED_STANZAS_DIR: "",
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Conflicting BSC peer-config audit sources",
    );
    await expect(
      readFile(path.join(reportDir, "latest.json"), "utf8"),
    ).rejects.toThrow(/ENOENT/u);
  });

  it("rejects ambiguous CLI and environment SSH password sources before writing reports", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const reportDir = path.join(dir, "report");
    const passwordFile = path.join(dir, "password.txt");
    await writeFile(passwordFile, "file-password\n", "utf8");
    const scriptPath = path.join(
      process.cwd(),
      "scripts/e2e/sccp-bsc-peer-config-audit.mjs",
    );
    const result = spawnSync(
      process.execPath,
      [
        scriptPath,
        "--ssh-password-file",
        passwordFile,
        "--output-dir",
        reportDir,
        "--remote-peer-count",
        "1",
        "--expected-peers",
        "1",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          SCCP_BSC_PEER_AUDIT_SSH_HOST: "ops@taira.example",
          SCCP_BSC_PEER_AUDIT_SSH_PASSWORD: "runtime-password",
          SCCP_BSC_PEER_AUDIT_SSH_CREDS_FILE: "",
          SCCP_BSC_PEER_AUDIT_OUTPUT_DIR: "",
          SCCP_BSC_PEER_AUDIT_SANITIZED_STANZAS_DIR: "",
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Conflicting BSC peer-config audit SSH credential sources",
    );
    expect(result.stderr).toContain("sshPassword");
    expect(result.stderr).toContain("sshPasswordFile");
    await expect(
      readFile(path.join(reportDir, "latest.json"), "utf8"),
    ).rejects.toThrow(/ENOENT/u);
  });

  it("atomically replaces stale sanitized snapshots without temp-file leftovers", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const peerFile = path.join(dir, "peer0.toml");
    const sanitizedDir = path.join(dir, "sanitized");
    const sanitizedFile = path.join(sanitizedDir, "peer0-peer0.toml");
    await mkdir(sanitizedDir, { recursive: true });
    await writeFile(peerFile, routeToml(), "utf8");
    await writeFile(sanitizedFile, "stale evidence that must be replaced\n");

    const report = await runBscSccpPeerConfigAudit({
      files: [peerFile],
      expectedPeers: 1,
      sanitizedStanzasDir: sanitizedDir,
    });

    expect(report.ready).toBe(false);
    expect(report.sanitizedStanzaFilesChecked).toBe(true);
    const sanitized = await readFile(sanitizedFile, "utf8");
    expect(sanitized).toContain("[[zk.sccp_route_manifests]]");
    expect(sanitized).toContain('route_id = "taira_bsc_xor"');
    expect(sanitized).not.toContain("stale evidence");
    expectSanitizedFileEvidence(report.peers[0], sanitized, "peer0-peer0.toml");
    expect(report.peers[0].sanitizedStanzaSha256).toBe(sha256Hex(sanitized));
    expect(
      (await readdir(sanitizedDir)).filter(
        (name) =>
          name.startsWith(".peer0-peer0.toml.") && name.endsWith(".tmp"),
      ),
    ).toEqual([]);
  });

  it("rejects malformed raw peer TOML hash evidence", () => {
    const report = evaluateBscSccpPeerConfigAudit([
      {
        source: "peer0.toml",
        rawTomlSha256: `0x${"00".repeat(32)}`,
        stanzas: parseSccpRouteManifestStanzas(routeToml(), "peer0.toml"),
      },
      {
        source: "peer1.toml",
        stanzas: parseSccpRouteManifestStanzas(routeToml(), "peer1.toml"),
      },
    ]);

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "peer-raw-toml-hashes")?.detail).toContain(
      "peer0.toml",
    );
    expect(failedCheck(report, "peer-raw-toml-hashes")?.detail).toContain(
      "peer1.toml",
    );
  });

  it("does not invoke accessor-backed fields while serializing sanitized peer stanzas", () => {
    const artifactGetter = vi.fn(() => ARTIFACT_B64);
    const stanza = parseSccpRouteManifestStanzas(routeToml(), "peer0.toml")[0];
    Object.defineProperty(stanza, "taira_burn_record_contract_artifact_b64", {
      configurable: true,
      enumerable: true,
      get: artifactGetter,
    });

    const sanitized = serializeSanitizedSccpRouteManifestStanzas([stanza]);

    expect(artifactGetter).not.toHaveBeenCalled();
    expect(sanitized).toContain('route_id = "taira_bsc_xor"');
    expect(sanitized).not.toContain(ARTIFACT_B64);
  });

  it("rejects forged or incomplete sanitized stanza file evidence", () => {
    const text = routeToml();
    const stanzas = parseSccpRouteManifestStanzas(text, "peer0.toml");
    const sanitized = serializeSanitizedSccpRouteManifestStanzas(stanzas);
    const basePeer = {
      source: "peer0.toml",
      rawTomlSha256: sha256Hex(text),
      stanzas,
    };
    const cases = [
      {
        label: "missing file hash",
        evidence: {
          sanitizedStanzaFileChecked: true,
          sanitizedStanzaFileVerified: true,
        },
      },
      {
        label: "unverified file",
        evidence: {
          sanitizedStanzaFileChecked: true,
          sanitizedStanzaFileVerified: false,
          sanitizedStanzaFileSha256: sha256Hex(sanitized),
        },
      },
      {
        label: "mismatched file hash",
        evidence: {
          sanitizedStanzaFileChecked: true,
          sanitizedStanzaFileVerified: true,
          sanitizedStanzaFileSha256: HASH_33,
        },
      },
      {
        label: "zero file hash",
        evidence: {
          sanitizedStanzaFileChecked: true,
          sanitizedStanzaFileVerified: true,
          sanitizedStanzaFileSha256: `0x${"00".repeat(32)}`,
        },
      },
    ];

    for (const { label, evidence } of cases) {
      const report = evaluateBscSccpPeerConfigAudit([
        {
          ...basePeer,
          ...evidence,
        },
      ]);

      expect(report.ready, label).toBe(false);
      expect(report.sanitizedStanzaFilesChecked, label).toBe(false);
      expect(
        failedCheck(report, "peer-sanitized-stanza-file-evidence")?.detail,
        label,
      ).toContain("peer0.toml");
    }
  });

  it("does not copy malicious route-stanza secret fields into sanitized snapshots", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const peerFile = path.join(dir, "peer0.toml");
    const sanitizedDir = path.join(dir, "sanitized");
    const secretNote = "operator rotated privateKey=0xfeedface before restart";
    await writeFile(
      peerFile,
      routeToml({
        operator_notes: VALID_MNEMONIC,
        private_key: "route-private-key-must-not-persist",
        audit_notes: secretNote,
      }),
      "utf8",
    );

    const report = await runBscSccpPeerConfigAudit({
      files: [peerFile],
      expectedPeers: 1,
      sanitizedStanzasDir: sanitizedDir,
    });

    expect(report.ready).toBe(false);
    expect(report.sanitizedStanzaFilesChecked).toBe(true);
    expect(report.peers[0].failedChecks).toContainEqual(
      expect.objectContaining({ id: "bsc-manifest-secret-scan" }),
    );
    const sanitized = await readFile(
      path.join(sanitizedDir, "peer0-peer0.toml"),
      "utf8",
    );
    expect(sanitized).toContain("[[zk.sccp_route_manifests]]");
    expect(sanitized).not.toContain("operator_notes");
    expect(sanitized).not.toContain("private_key");
    expect(sanitized).not.toContain("audit_notes");
    expect(sanitized).not.toContain("route-private-key");
    expect(sanitized).not.toContain("privateKey=");
    expect(sanitized).not.toContain("feedface");
    expect(sanitized).not.toContain("abandon abandon");
    expectSanitizedFileEvidence(report.peers[0], sanitized, "peer0-peer0.toml");
    expect(JSON.stringify(report)).not.toContain("route-private-key");
    expect(JSON.stringify(report)).not.toContain("privateKey=");
    expect(JSON.stringify(report)).not.toContain("feedface");
    expect(JSON.stringify(report)).not.toContain("abandon abandon");
  });

  it("uses replayable peer*.toml names for sanitized non-TOML input streams", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const streamedInput = path.join(dir, "fd-11");
    const sanitizedDir = path.join(dir, "sanitized");
    await writeFile(streamedInput, routeToml(), "utf8");

    const report = await runBscSccpPeerConfigAudit({
      files: [streamedInput],
      expectedPeers: 1,
      sanitizedStanzasDir: sanitizedDir,
    });

    expect(report.ready).toBe(false);
    expect(report.sanitizedStanzaFilesChecked).toBe(true);
    const sanitized = await readFile(
      path.join(sanitizedDir, "peer0.toml"),
      "utf8",
    );
    expect(sanitized).toContain('route_id = "taira_bsc_xor"');
    expectSanitizedFileEvidence(report.peers[0], sanitized, "peer0.toml");

    const replayed = await runBscSccpPeerConfigAudit({
      dir: sanitizedDir,
      expectedPeers: 1,
    });
    expect(replayed.ready).toBe(false);
  });

  it("does not echo secret-like local peer paths into public audit evidence", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const secretHex = `0x${"aa".repeat(32)}`;
    const secretNamedPeerFile = path.join(dir, `private_key=${secretHex}.toml`);
    const sanitizedDir = path.join(dir, "sanitized");
    await writeFile(secretNamedPeerFile, routeToml(), "utf8");

    const report = await runBscSccpPeerConfigAudit({
      files: [secretNamedPeerFile],
      expectedPeers: 1,
      sanitizedStanzasDir: sanitizedDir,
    });

    expect(report.ready).toBe(false);
    expect(report.peers[0].source).toBe("peer0.toml");
    expect(path.basename(report.peers[0].sanitizedStanzaSource)).toBe(
      "peer0.toml",
    );
    const sanitized = await readFile(
      path.join(sanitizedDir, "peer0.toml"),
      "utf8",
    );
    expectSanitizedFileEvidence(report.peers[0], sanitized, "peer0.toml");
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("private_key");
    expect(serialized).not.toContain(secretHex);
  });

  it("rejects symlinked sanitized stanza output files before writing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const outside = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-peer-audit-outside-"),
    );
    const peerFile = path.join(dir, "peer0.toml");
    const sanitizedDir = path.join(dir, "sanitized");
    const symlinkTarget = path.join(outside, "peer0.toml");
    await mkdir(sanitizedDir, { recursive: true });
    await writeFile(peerFile, routeToml(), "utf8");
    await writeFile(symlinkTarget, "must-not-overwrite\n", "utf8");
    await symlink(symlinkTarget, path.join(sanitizedDir, "peer0-peer0.toml"));

    await expect(
      runBscSccpPeerConfigAudit({
        files: [peerFile],
        expectedPeers: 1,
        sanitizedStanzasDir: sanitizedDir,
      }),
    ).rejects.toThrow(/Sanitized stanza output file .*symbolic link/u);
    await expect(readFile(symlinkTarget, "utf8")).resolves.toBe(
      "must-not-overwrite\n",
    );
  });

  it("rejects symlinked sanitized stanza output directories", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const actualSanitizedDir = path.join(dir, "actual-sanitized");
    const symlinkedSanitizedDir = path.join(dir, "sanitized");
    const peerFile = path.join(dir, "peer0.toml");
    await mkdir(actualSanitizedDir, { recursive: true });
    await symlink(actualSanitizedDir, symlinkedSanitizedDir);
    await writeFile(peerFile, routeToml(), "utf8");

    await expect(
      runBscSccpPeerConfigAudit({
        files: [peerFile],
        expectedPeers: 1,
        sanitizedStanzasDir: symlinkedSanitizedDir,
      }),
    ).rejects.toThrow(/Sanitized stanza output directory .*symbolic link/u);
  });

  it("serializes only allowlisted SCCP route TOML keys", () => {
    const sanitized = serializeSanitizedSccpRouteManifestStanzas(
      parseSccpRouteManifestStanzas(
        routeToml({
          route_id: "taira_bsc_xor",
          asset_key: "xor",
          private_key: "must-not-serialize",
          operator_notes: "must-not-serialize",
        }),
      ),
    );

    expect(sanitized).toContain('route_id = "taira_bsc_xor"');
    expect(sanitized).toContain('asset_key = "xor"');
    expect(sanitized).not.toContain("private_key");
    expect(sanitized).not.toContain("operator_notes");
    expect(sanitized).not.toContain("must-not-serialize");
  });

  it("streams remote peer configs through sshpass without storing raw validator secrets", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const sanitizedDir = path.join(dir, "sanitized");
    const credsFile = path.join(dir, "creds.txt");
    const sshPassword = "runtime-password-must-not-serialize";
    await writeFile(credsFile, `ops@taira.example\n${sshPassword}\n`, "utf8");
    const calls = [];
    const remoteToml = [
      'private_key = "validator-private-key-must-not-persist"',
      "[network]",
      'identity_private_key = "node-identity-secret-must-not-persist"',
      routeToml(),
    ].join("\n");
    const execFileImpl = async (file, args, options) => {
      calls.push({
        file,
        args,
        sshpass: options.env?.SSHPASS,
      });
      return {
        stdout: remoteToml,
        stderr: "",
      };
    };

    const report = await runBscSccpRemotePeerConfigAudit({
      sshCredsFile: credsFile,
      remotePeerCount: 1,
      expectedPeers: 1,
      sanitizedStanzasDir: sanitizedDir,
      execFileImpl,
    });

    expect(report.ready).toBe(false);
    expect(report.sanitizedStanzaFilesChecked).toBe(true);
    expect(report.peers[0].rawTomlSha256).toBe(sha256Hex(remoteToml));
    const sanitized = await readFile(
      path.join(sanitizedDir, "peer0.toml"),
      "utf8",
    );
    expect(report.peers[0].sanitizedStanzaSha256).toBe(sha256Hex(sanitized));
    expect(path.basename(report.peers[0].source)).toBe("peer0.toml");
    expectSanitizedFileEvidence(report.peers[0], sanitized, "peer0.toml");
    expect(failedCheck(report, "peer-raw-toml-hashes")).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe("sshpass");
    expect(calls[0].args).toEqual(
      expect.arrayContaining([
        "-e",
        "ssh",
        "ops@taira.example",
        "cat",
        "/Users/administrator/dev/iroha/dist/taira-localnet/peer0.toml",
      ]),
    );
    expect(calls[0].args).not.toContain(sshPassword);
    expect(calls[0].sshpass).toBe(sshPassword);

    expect(sanitized).toContain("[[zk.sccp_route_manifests]]");
    expect(sanitized).toContain('route_id = "taira_bsc_xor"');
    expect(sanitized).not.toContain("[network]");
    expect(sanitized).not.toContain("private_key");
    expect(sanitized).not.toContain("identity_private_key");
    expect(sanitized).not.toContain("validator-private-key");
    expect(sanitized).not.toContain("node-identity-secret");
    expect(JSON.stringify(report)).not.toContain(sshPassword);
    expect(JSON.stringify(report)).not.toContain("validator-private-key");
  });

  it("rejects ambiguous SSH password sources before opening credential files or invoking ssh", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const missingCredsFile = path.join(dir, "missing-creds.txt");
    const missingPasswordFile = path.join(dir, "missing-password.txt");
    const cases = [
      {
        name: "runtime-host-with-creds-file",
        input: {
          sshHost: "ops@taira.example",
          sshCredsFile: missingCredsFile,
        },
        errorPrefix: "Conflicting BSC peer-config audit SSH host sources",
        pattern: /sshHost.*sshCredsFile/u,
      },
      {
        name: "runtime-password-with-password-file",
        input: {
          sshHost: "ops@taira.example",
          sshPassword: "runtime-password",
          sshPasswordFile: missingPasswordFile,
        },
        errorPrefix: "Conflicting BSC peer-config audit SSH credential sources",
        pattern: /sshPassword.*sshPasswordFile/u,
      },
      {
        name: "runtime-password-with-creds-file",
        input: {
          sshPassword: "runtime-password",
          sshCredsFile: missingCredsFile,
        },
        errorPrefix: "Conflicting BSC peer-config audit SSH credential sources",
        pattern: /sshPassword.*sshCredsFile/u,
      },
      {
        name: "password-file-with-creds-file",
        input: {
          sshPasswordFile: missingPasswordFile,
          sshCredsFile: missingCredsFile,
        },
        errorPrefix: "Conflicting BSC peer-config audit SSH credential sources",
        pattern: /sshPasswordFile.*sshCredsFile/u,
      },
    ];

    try {
      for (const testCase of cases) {
        const execFileImpl = vi.fn(async () => {
          throw new Error("ssh must not run");
        });

        await expect(
          runBscSccpRemotePeerConfigAudit({
            ...testCase.input,
            remotePeerCount: 1,
            expectedPeers: 1,
            sanitizedStanzasDir: path.join(dir, testCase.name),
            execFileImpl,
          }),
        ).rejects.toThrow(
          new RegExp(
            `${testCase.errorPrefix}: ${testCase.pattern.source}`,
            "u",
          ),
        );
        expect(execFileImpl).not.toHaveBeenCalled();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects symlinked SSH credentials files before remote peer audit", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    try {
      const target = path.join(dir, "creds.target.txt");
      const link = path.join(dir, "creds.txt");
      await writeFile(target, "ops@taira.example\npassword\n", "utf8");
      await symlink(target, link);

      await expect(
        runBscSccpRemotePeerConfigAudit({
          sshCredsFile: link,
          remotePeerCount: 1,
          expectedPeers: 1,
          sanitizedStanzasDir: path.join(dir, "sanitized"),
          execFileImpl: async () => {
            throw new Error("ssh must not run");
          },
        }),
      ).rejects.toThrow(/SSH credentials file .*symbolic link/u);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects oversized SSH credentials files before remote peer audit", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    try {
      const credsFile = path.join(dir, "creds.txt");
      await writeFile(credsFile, "");
      await truncate(credsFile, SCCP_BSC_SSH_CREDENTIALS_MAX_BYTES + 1);

      await expect(
        runBscSccpRemotePeerConfigAudit({
          sshCredsFile: credsFile,
          remotePeerCount: 1,
          expectedPeers: 1,
          sanitizedStanzasDir: path.join(dir, "sanitized"),
          execFileImpl: async () => {
            throw new Error("ssh must not run");
          },
        }),
      ).rejects.toThrow(/SSH credentials file .*maximum allowed/u);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects symlinked SSH password files before remote peer audit", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    try {
      const target = path.join(dir, "password.target.txt");
      const link = path.join(dir, "password.txt");
      await writeFile(target, "password\n", "utf8");
      await symlink(target, link);

      await expect(
        runBscSccpRemotePeerConfigAudit({
          sshHost: "ops@taira.example",
          sshPasswordFile: link,
          remotePeerCount: 1,
          expectedPeers: 1,
          sanitizedStanzasDir: path.join(dir, "sanitized"),
          execFileImpl: async () => {
            throw new Error("ssh must not run");
          },
        }),
      ).rejects.toThrow(/SSH password file .*symbolic link/u);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects oversized SSH password files before remote peer audit", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    try {
      const passwordFile = path.join(dir, "password.txt");
      await writeFile(passwordFile, "");
      await truncate(passwordFile, SCCP_BSC_SSH_CREDENTIALS_MAX_BYTES + 1);

      await expect(
        runBscSccpRemotePeerConfigAudit({
          sshHost: "ops@taira.example",
          sshPasswordFile: passwordFile,
          remotePeerCount: 1,
          expectedPeers: 1,
          sanitizedStanzasDir: path.join(dir, "sanitized"),
          execFileImpl: async () => {
            throw new Error("ssh must not run");
          },
        }),
      ).rejects.toThrow(/SSH password file .*maximum allowed/u);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects remote route-stanza secrets without writing them to sanitized snapshots or reports", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const sanitizedDir = path.join(dir, "sanitized");
    const execFileImpl = async () => ({
      stdout: routeToml({
        private_key: "route-private-key-must-not-persist",
        audit_notes: "operator rotated privateKey=0xfeedface before restart",
        operator_notes: VALID_MNEMONIC,
      }),
      stderr: "",
    });

    const report = await runBscSccpRemotePeerConfigAudit({
      sshHost: "ops@taira.example",
      sshPassword: "runtime-password-must-not-serialize",
      remotePeerCount: 1,
      expectedPeers: 1,
      sanitizedStanzasDir: sanitizedDir,
      execFileImpl,
    });

    expect(report.ready).toBe(false);
    expect(report.sanitizedStanzaFilesChecked).toBe(true);
    expect(report.peers[0].failedChecks).toContainEqual(
      expect.objectContaining({ id: "bsc-manifest-secret-scan" }),
    );
    const sanitized = await readFile(
      path.join(sanitizedDir, "peer0.toml"),
      "utf8",
    );
    expect(sanitized).toContain("[[zk.sccp_route_manifests]]");
    expect(sanitized).not.toContain("private_key");
    expect(sanitized).not.toContain("audit_notes");
    expect(sanitized).not.toContain("operator_notes");
    expect(sanitized).not.toContain("feedface");
    expect(sanitized).not.toContain("route-private-key");
    expect(sanitized).not.toContain("abandon abandon");
    expectSanitizedFileEvidence(report.peers[0], sanitized, "peer0.toml");
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("feedface");
    expect(serialized).not.toContain("route-private-key");
    expect(serialized).not.toContain("runtime-password");
    expect(serialized).not.toContain("abandon abandon");
  });

  it("rejects oversized remote peer TOML before parsing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const oversizedRemoteToml = "x".repeat(
      SCCP_BSC_PEER_CONFIG_TOML_MAX_BYTES + 1,
    );
    const execFileImpl = async () => ({
      stdout: oversizedRemoteToml,
      stderr: "",
    });

    let thrown = "";
    try {
      await runBscSccpRemotePeerConfigAudit({
        sshHost: "ops@taira.example",
        remotePeerCount: 1,
        expectedPeers: 1,
        sanitizedStanzasDir: path.join(dir, "sanitized"),
        execFileImpl,
      });
    } catch (error) {
      thrown = error instanceof Error ? error.message : String(error);
    }

    expect(thrown).toMatch(/Remote TAIRA peer config .*maximum allowed/u);
    expect(thrown).not.toContain(oversizedRemoteToml.slice(0, 128));
  });

  it("rejects injection-shaped remote audit inputs before invoking ssh", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const execFileImpl = async () => {
      throw new Error("ssh must not be invoked for unsafe input");
    };

    await expect(
      runBscSccpRemotePeerConfigAudit({
        sshHost: "-oProxyCommand=sh",
        remotePeerCount: 1,
        sanitizedStanzasDir: path.join(dir, "host"),
        execFileImpl,
      }),
    ).rejects.toThrow(/ssh-host/u);

    await expect(
      runBscSccpRemotePeerConfigAudit({
        sshHost: "ops@taira.example",
        remoteDir:
          "/Users/administrator/dev/iroha/dist/taira-localnet;cat /etc/passwd",
        remotePeerCount: 1,
        sanitizedStanzasDir: path.join(dir, "path"),
        execFileImpl,
      }),
    ).rejects.toThrow(/remote-dir/u);

    await expect(
      runBscSccpRemotePeerConfigAudit({
        sshHost: "ops@taira.example",
        remoteDir: "/Users/administrator/dev/iroha/../creds",
        remotePeerCount: 1,
        sanitizedStanzasDir: path.join(dir, "traversal"),
        execFileImpl,
      }),
    ).rejects.toThrow(/remote-dir/u);
  });

  it("redacts runtime secrets from remote ssh failure messages", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-peer-audit-"));
    const sshPassword = "runtime-password-must-not-leak";
    const rawBearerToken = "Bearer ssh-raw-bearer-token-1234567890";
    const rawApiKey = ["sk", "live", "sshrawsecret1234567890"].join("_");
    const rawApiKeyPrefix = ["sk", "live", "sshrawsecret"].join("_");
    const execFileImpl = async () => {
      const error = new Error(`auth failed with ${sshPassword}`);
      error.stderr = `password=${sshPassword} privateKey=0xfeedface bearerToken=0xfeedface Authorization: ${rawBearerToken} api key ${rawApiKey} mnemonic=${VALID_MNEMONIC}`;
      throw error;
    };

    let thrown = "";
    try {
      await runBscSccpRemotePeerConfigAudit({
        sshHost: "ops@taira.example",
        sshPassword,
        remotePeerCount: 1,
        sanitizedStanzasDir: path.join(dir, "sanitized"),
        execFileImpl,
      });
    } catch (error) {
      thrown = error instanceof Error ? error.message : String(error);
    }

    expect(thrown).toMatch(
      /Unable to read remote TAIRA peer config over SSH: auth failed with \[redacted\]/u,
    );
    expect(thrown).not.toContain(sshPassword);
    expect(thrown).not.toContain("bearerToken=0xfeedface");
    expect(thrown).not.toContain("ssh-raw-bearer-token");
    expect(thrown).not.toContain(rawApiKeyPrefix);
    expect(thrown).not.toContain("feedface");
    expect(thrown).not.toContain("abandon abandon");
  });
});
