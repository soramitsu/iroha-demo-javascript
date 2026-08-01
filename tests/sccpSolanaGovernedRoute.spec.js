// @vitest-environment node

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { afterEach, describe, expect, it } from "vitest";
import {
  SOLANA_ORDERED_INITIALIZATION_SCHEMA,
  SOLANA_TESTNET_RPC_URL,
  validateSolanaOrderedInitializationEvidence,
} from "../scripts/e2e/sccp-solana-ordered-initialization.mjs";
import {
  SOLANA_EXACT_INITIALIZER_INPUT_SCHEMA,
  validateSolanaExactInitializerInput,
} from "../scripts/sccp-solana-exact-initialize.mjs";
import {
  SOLANA_GOVERNED_ROUTE_POLICY_SETTLEMENT_SCHEMA,
  assertSolanaGovernedRouteEvidenceBindings,
  buildExactSolanaGovernedRouteCandidate,
  buildPinnedSolanaGovernedRoute,
  parseSolanaGovernedRouteArgs,
  validateSolanaGovernedRoutePolicySettlement,
} from "../scripts/sccp-solana-governed-route.mjs";
import { buildExactSolanaGovernedRouteFixture } from "./helpers/sccpSolanaExactRegistryFixture.js";

const HASH_OF_EMPTY_OBJECT = `0x${createHash("sha256")
  .update("{}")
  .digest("hex")}`;
const hash = (byte) => `0x${byte.toString(16).padStart(2, "0").repeat(32)}`;
const signature = (byte) => bs58.encode(Buffer.alloc(64, byte));
const rawPublicKeyToBase58 = (value) =>
  new PublicKey(Buffer.from(value, "hex")).toBase58();
const clone = (value) => structuredClone(value);

const finalizationFromRoute = (route, role) => {
  const deployment = route.destination.deployment;
  const source = route.source_identity.emitter.identity;
  const values = {
    destination: {
      program_address: rawPublicKeyToBase58(deployment.route_program_id),
      programdata_address: rawPublicKeyToBase58(
        deployment.route_program_data_address,
      ),
      artifact_sha256: hash(0xd1),
      program_code_hash: `0x${deployment.route_program_code_hash.toLowerCase()}`,
      programdata_deployment_slot: deployment.route_program_data_slot,
    },
    source: {
      program_address: rawPublicKeyToBase58(source.program_id),
      programdata_address: rawPublicKeyToBase58(source.program_data_address),
      artifact_sha256: hash(0xd2),
      program_code_hash: `0x${source.program_code_hash.toLowerCase()}`,
      programdata_deployment_slot: source.program_data_slot,
    },
    native_verifier: {
      program_address: rawPublicKeyToBase58(
        deployment.native_verifier_program_id,
      ),
      programdata_address: rawPublicKeyToBase58(
        deployment.native_verifier_program_data_address,
      ),
      artifact_sha256: hash(0xd3),
      program_code_hash: `0x${deployment.native_verifier_program_code_hash.toLowerCase()}`,
      programdata_deployment_slot: deployment.native_verifier_program_data_slot,
    },
  };
  return {
    ...values[role],
    transaction_signature: signature(0x51),
    finalized_slot: 22,
  };
};

const exactInitializerInput = () => {
  const route = buildExactSolanaGovernedRouteFixture();
  const destination = finalizationFromRoute(route, "destination");
  const source = finalizationFromRoute(route, "source");
  const nativeVerifier = finalizationFromRoute(route, "native_verifier");
  return {
    schema: SOLANA_EXACT_INITIALIZER_INPUT_SCHEMA,
    solana_rpc_url: SOLANA_TESTNET_RPC_URL,
    fresh_deploy_report_sha256: HASH_OF_EMPTY_OBJECT,
    payer_address: rawPublicKeyToBase58("41".repeat(32)),
    mint_address: rawPublicKeyToBase58(
      route.destination.deployment.token_mint_address,
    ),
    program_finalizations: {
      destination,
      source,
      native_verifier: nativeVerifier,
    },
    route: {
      destination_program_id: destination.program_address,
      source_program_id: source.program_address,
      native_verifier_program_id: nativeVerifier.program_address,
      route_revision: 1,
    },
    governed_destination_deployment: clone(route.destination.deployment),
  };
};

const policySettlement = () => {
  const route = buildExactSolanaGovernedRouteFixture();
  return {
    schema: SOLANA_GOVERNED_ROUTE_POLICY_SETTLEMENT_SCHEMA,
    settlement: clone(route.settlement),
    sora_outbound_execution_policy: clone(route.sora_outbound_execution_policy),
  };
};

const initializationRecord = ({ program, account, byte, slot }) => ({
  program_address: program,
  account_address: account,
  transaction_signature: signature(byte),
  finalized_slot: slot,
});

const orderedInitializationEvidence = (
  initializer = exactInitializerInput(),
) => {
  const deployment = initializer.governed_destination_deployment;
  const mint = initializer.mint_address;
  const material = rawPublicKeyToBase58(
    deployment.native_verifier_material_account,
  );
  const destinationState = rawPublicKeyToBase58(deployment.route_state_account);
  const sourceRoute =
    buildExactSolanaGovernedRouteFixture().source_identity.emitter.identity;
  const sourceState = rawPublicKeyToBase58(sourceRoute.state_account);
  const programs = initializer.route;
  const bootstrapSignature = 0x61;
  return {
    schema: SOLANA_ORDERED_INITIALIZATION_SCHEMA,
    route_id: "taira_sol_xor",
    asset_key: "xor",
    revision: 1,
    solana_rpc_url: SOLANA_TESTNET_RPC_URL,
    fresh_deploy_report_sha256: initializer.fresh_deploy_report_sha256,
    program_finalizations: clone(initializer.program_finalizations),
    initialization_transactions: {
      token_mint_create: initializationRecord({
        program: "11111111111111111111111111111111",
        account: mint,
        byte: bootstrapSignature,
        slot: 30,
      }),
      token_mint_initialize: initializationRecord({
        program: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        account: mint,
        byte: bootstrapSignature,
        slot: 30,
      }),
      native_verifier_material_initialize: initializationRecord({
        program: programs.native_verifier_program_id,
        account: material,
        byte: bootstrapSignature,
        slot: 30,
      }),
      native_verifier_material_appends: [
        initializationRecord({
          program: programs.native_verifier_program_id,
          account: material,
          byte: 0x62,
          slot: 31,
        }),
        initializationRecord({
          program: programs.native_verifier_program_id,
          account: material,
          byte: 0x63,
          slot: 32,
        }),
        initializationRecord({
          program: programs.native_verifier_program_id,
          account: material,
          byte: 0x64,
          slot: 33,
        }),
      ],
      native_verifier_material_seal: initializationRecord({
        program: programs.native_verifier_program_id,
        account: material,
        byte: 0x65,
        slot: 34,
      }),
      destination_route_initialize: initializationRecord({
        program: programs.destination_program_id,
        account: destinationState,
        byte: 0x66,
        slot: 35,
      }),
      source_route_initialize: initializationRecord({
        program: programs.source_program_id,
        account: sourceState,
        byte: 0x67,
        slot: 36,
      }),
    },
    captured_at: "2026-07-19T00:00:00.000Z",
  };
};

const freshDeployBinding = (initializer = exactInitializerInput()) => {
  const roleMap = {
    destination: "destination",
    source: "source",
    native_verifier: "nativeVerifier",
  };
  const programsByRole = Object.fromEntries(
    Object.entries(roleMap).map(([initializerRole, reportRole]) => {
      const record = initializer.program_finalizations[initializerRole];
      return [
        reportRole,
        {
          programId: record.program_address,
          programdataAddress: record.programdata_address,
          artifactSha256: record.artifact_sha256,
          codeHash: record.program_code_hash,
          deploy: { finalizedSlot: record.programdata_deployment_slot },
          immutableProgramdataReadback: {
            deploymentSlot: record.programdata_deployment_slot,
            immutable: true,
          },
          immutableFinalization: {
            signature: record.transaction_signature,
            finalizedSlot: record.finalized_slot,
          },
        },
      ];
    }),
  );
  const finalization = initializer.program_finalizations.destination;
  return {
    reportSha256: initializer.fresh_deploy_report_sha256,
    operationId: hash(0xe1),
    planSha256: hash(0xe2),
    programsByRole,
    immutableFinalization: {
      oneAtomicTransaction: true,
      signature: finalization.transaction_signature,
      finalizedSlot: finalization.finalized_slot,
    },
  };
};

const validatedArtifacts = () => {
  const initializer = exactInitializerInput();
  const normalizedInitializer =
    validateSolanaExactInitializerInput(initializer);
  const normalizedOrderedInitialization =
    validateSolanaOrderedInitializationEvidence(
      orderedInitializationEvidence(initializer),
    );
  const candidate = buildExactSolanaGovernedRouteCandidate({
    normalizedInitializer,
    policySettlement: policySettlement(),
  });
  return {
    initializer,
    normalizedInitializer,
    normalizedOrderedInitialization,
    candidate,
    freshDeployReport: freshDeployBinding(initializer),
  };
};

describe("deterministic exact Solana governed-route candidate", () => {
  it("derives the complete bidirectional route without free Solana identity fields", () => {
    const { candidate } = validatedArtifacts();
    expect(candidate.route).toEqual(buildExactSolanaGovernedRouteFixture());
    expect(candidate.route).toEqual(
      buildExactSolanaGovernedRouteCandidate({
        normalizedInitializer: validateSolanaExactInitializerInput(
          exactInitializerInput(),
        ),
        policySettlement: policySettlement(),
      }).route,
    );
    expect(candidate.summary).toMatchObject({
      routeId: "taira_sol_xor",
      assetKey: "xor",
      revision: 1,
      activation: "bidirectional",
      settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      payloadAmountScale: 9,
    });
  });

  it("binds fresh deployment, initializer, ordered chronology, and route hashes", () => {
    const artifacts = validatedArtifacts();
    expect(
      assertSolanaGovernedRouteEvidenceBindings({
        normalizedInitializer: artifacts.normalizedInitializer,
        freshDeployReport: artifacts.freshDeployReport,
        normalizedOrderedInitialization:
          artifacts.normalizedOrderedInitialization,
        routeSummary: artifacts.candidate.summary,
      }),
    ).toEqual({
      ready: true,
      freshDeployReportSha256: HASH_OF_EMPTY_OBJECT,
      maxFinalizationSlot: 22,
      firstInitializationSlot: 30,
    });
  });

  it.each([
    [
      "settlement alias",
      (value) => (value.settlement.asset_definition_id = "xor#universal"),
    ],
    [
      "settlement scale",
      (value) => (value.settlement.payload_amount_scale = 8),
    ],
    [
      "custody checksum",
      (value) => (value.settlement.custody_account_id += "x"),
    ],
    [
      "policy semantics",
      (value) =>
        (value.sora_outbound_execution_policy.semantics = "RecordSccpMessage"),
    ],
    [
      "lowercase contract hash",
      (value) =>
        (value.sora_outbound_execution_policy.contract_artifact_sha256 =
          "b1".repeat(32)),
    ],
    [
      "aliased VK hash",
      (value) =>
        (value.sora_outbound_execution_policy.vk_ref.commitment =
          value.sora_outbound_execution_policy.contract_artifact_sha256),
    ],
    [
      "portable VK traversal",
      (value) =>
        (value.sora_outbound_execution_policy.vk_ref.name = "ivm/../key"),
    ],
    [
      "gas limit",
      (value) => (value.sora_outbound_execution_policy.gas_limit = 0),
    ],
    [
      "unknown route-control field",
      (value) =>
        (value.destination_program_id = rawPublicKeyToBase58("71".repeat(32))),
    ],
  ])("rejects adversarial TAIRA policy mutation: %s", (_label, mutate) => {
    const value = policySettlement();
    mutate(value);
    expect(() => validateSolanaGovernedRoutePolicySettlement(value)).toThrow();
  });

  it.each([
    [
      "fresh report hash",
      (value) => {
        value.fresh_deploy_report_sha256 = hash(0xf1);
      },
    ],
    [
      "destination artifact hash",
      (value) => {
        value.program_finalizations.destination.artifact_sha256 = hash(0xf2);
      },
    ],
    [
      "atomic finalization signature",
      (value) => {
        for (const record of Object.values(value.program_finalizations)) {
          record.transaction_signature = signature(0x77);
        }
      },
    ],
    [
      "destination initialization PDA",
      (value) => {
        value.initialization_transactions.destination_route_initialize.account_address =
          rawPublicKeyToBase58("72".repeat(32));
      },
    ],
  ])("rejects adversarial ordered-evidence mutation: %s", (_label, mutate) => {
    const artifacts = validatedArtifacts();
    const value = orderedInitializationEvidence(artifacts.initializer);
    mutate(value);
    const mutated = validateSolanaOrderedInitializationEvidence(value);
    expect(() =>
      assertSolanaGovernedRouteEvidenceBindings({
        normalizedInitializer: artifacts.normalizedInitializer,
        freshDeployReport: artifacts.freshDeployReport,
        normalizedOrderedInitialization: mutated,
        routeSummary: artifacts.candidate.summary,
      }),
    ).toThrow();
  });

  it("rejects a deployment-derived hash mutation before route construction", () => {
    const value = exactInitializerInput();
    value.governed_destination_deployment.route_program_code_hash = "F4".repeat(
      32,
    );
    expect(() => validateSolanaExactInitializerInput(value)).toThrow(
      /pinned fresh deployment/u,
    );
  });

  it("parses only the fixed signer-free CLI surface", () => {
    expect(parseSolanaGovernedRouteArgs(["--help"])).toEqual({ help: true });
    expect(() => parseSolanaGovernedRouteArgs(["--mint", "manual"])).toThrow(
      /Unknown option/u,
    );
    expect(() =>
      parseSolanaGovernedRouteArgs(["--initializer-input=initializer.json"]),
    ).toThrow(/Option=value/u);
  });
});

describe("governed-route byte pins", () => {
  const directories = [];

  afterEach(async () => {
    await Promise.all(
      directories
        .splice(0)
        .map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it("fails closed on an independently mutated input pin before writing output", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "sccp-solana-governed-route-"),
    );
    directories.push(directory);
    const files = Object.fromEntries(
      ["initializer", "fresh", "ordered", "policy", "output"].map((name) => [
        name,
        path.join(directory, `${name}.json`),
      ]),
    );
    await Promise.all(
      [files.initializer, files.fresh, files.ordered, files.policy].map(
        (file) => writeFile(file, "{}\n"),
      ),
    );
    const validPin = `0x${createHash("sha256").update("{}\n").digest("hex")}`;
    await expect(
      buildPinnedSolanaGovernedRoute({
        "initializer-input": files.initializer,
        "expected-initializer-input-sha256": hash(0xee),
        "fresh-deploy-report": files.fresh,
        "expected-fresh-deploy-report-sha256": validPin,
        "ordered-initialization-evidence": files.ordered,
        "expected-ordered-initialization-evidence-sha256": validPin,
        "taira-policy-settlement": files.policy,
        "expected-taira-policy-settlement-sha256": validPin,
        out: files.output,
      }),
    ).rejects.toThrow(/independent review pin/u);
    await expect(readFile(files.output)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
