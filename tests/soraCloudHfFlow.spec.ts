import { describe, expect, it, vi } from "vitest";

import { executeSoraCloudHfDraftToCommit } from "../electron/soraCloudHfFlow";
import {
  SORACLOUD_HF_JOIN_WIRE_ID,
  type SoraCloudHfDeployExpectation,
} from "../electron/soraCloudResponses";

const ACCOUNT_ID = "testuReviewedAccount";
const SIGNER = `ed0120${"11".repeat(32)}`;
const TX_HASH = "ab".repeat(32);
const FINALITY = {
  status: "finalized" as const,
  transactionHash: TX_HASH,
  blockHeight: 17,
  blockHash: "cd".repeat(32),
  finalizedBlockHeight: 17,
};
const RESOURCE_PROFILE = {
  required_model_bytes: 1_073_741_824,
  backend_family: { backend_family: "Transformers", value: null },
  model_format: { model_format: "Safetensors", value: null },
  disk_cache_bytes_floor: 2_147_483_648,
  ram_bytes_floor: 4_294_967_296,
  vram_bytes_floor: 0,
};

const expected: SoraCloudHfDeployExpectation = {
  accountId: ACCOUNT_ID,
  signer: SIGNER,
  joinProvenance: { signer: SIGNER, signature: "AA==" },
  generatedServiceProvenance: { signer: SIGNER, signature: "AA==" },
  repoId: "openai/demo-model",
  resolvedRevision: "main",
  modelName: "demo-model",
  serviceName: "demo_model_service",
  storageClass: "warm",
  leaseTermMs: 86_400_000,
  leaseAssetDefinitionId: "4cuvDVPuLBKJyN6dPbRQhmLh68sU",
  baseFee: "0.00001",
};

const draft = {
  ok: true,
  authority: ACCOUNT_ID,
  signed_by: SIGNER,
  tx_instructions: [{ wire_id: SORACLOUD_HF_JOIN_WIRE_ID, payload_hex: "01" }],
};

const decodedJoin = {
  JoinSoracloudHfSharedLease: {
    repo_id: "openai/demo-model",
    resolved_revision: "main",
    model_name: "demo-model",
    service_name: "demo_model_service",
    apartment_name: null,
    storage_class: { type: "Warm", value: null },
    lease_term_ms: 86_400_000,
    lease_asset_definition_id: "4cuvDVPuLBKJyN6dPbRQhmLh68sU",
    base_fee: "0.00001",
    resource_profile: RESOURCE_PROFILE,
    max_compute_reservation_fee: "0.0000075",
    provenance: { signer: SIGNER, signature: "AA==" },
  },
};

const status = (sequence: number, serviceName = "demo_model_service") => ({
  schema_version: 1,
  source: {
    schema_version: 1,
    source_id: "source-id",
    repo_id: "openai/demo-model",
    resolved_revision: "main",
    model_name: "demo-model",
    adapter_id: "hf.shared.v1",
    normalized_runtime_hash: "runtime-hash",
    resource_profile: RESOURCE_PROFILE,
    status: { status: "PendingImport", value: null },
    created_at_ms: 100,
    updated_at_ms: 110,
  },
  pool: {
    schema_version: 1,
    pool_id: "pool-id",
    source_id: "source-id",
    storage_class: { type: "Warm", value: null },
    lease_asset_definition_id: "4cuvDVPuLBKJyN6dPbRQhmLh68sU",
    base_fee: "0.00001",
    lease_term_ms: 86_400_000,
    window_started_at_ms: 100,
    window_expires_at_ms: 86_400_100,
    active_member_count: 1,
    status: { status: "Active", value: null },
    queued_next_window: null,
  },
  member: {
    schema_version: 1,
    pool_id: "pool-id",
    source_id: "source-id",
    account_id: ACCOUNT_ID,
    status: { status: "Active", value: null },
    joined_at_ms: 100,
    updated_at_ms: 110,
    total_paid: "0.00001",
    total_refunded: "0",
    last_charge: "0.00001",
    total_compute_paid: "0",
    total_compute_refunded: "0",
    last_compute_charge: "0",
    service_bindings: [serviceName],
    apartment_bindings: [],
  },
  latest_audit_event: {
    schema_version: 1,
    sequence,
    action: { action: "CreateWindow", value: null },
    pool_id: "pool-id",
    source_id: "source-id",
    account_id: ACCOUNT_ID,
    occurred_at_ms: 110,
    active_member_count: 1,
    charged: "0.00001",
    refunded: "0",
    lease_expires_at_ms: 86_400_100,
    service_name: serviceName,
    apartment_name: null,
  },
  audit_event_count: 1,
  storage_base_fee: "0.00001",
  compute_reservation_fee: "0",
  eligible_host_count: 1,
  warm_host_count: 1,
  importer_pending: true,
});

describe("SoraCloud draft-to-commit orchestration", () => {
  it("reports success only after draft validation, commit, and newer live state", async () => {
    const commitInstructions = vi.fn(async () => ({
      hash: TX_HASH,
      finality: FINALITY,
    }));
    const fetchCommittedStatus = vi
      .fn()
      .mockResolvedValueOnce(status(8))
      .mockResolvedValueOnce(status(9));
    const wait = vi.fn(async () => undefined);

    const result = await executeSoraCloudHfDraftToCommit({
      expected,
      minimumSequenceExclusive: 8,
      statusAttempts: 2,
      statusPollIntervalMs: 0,
      dependencies: {
        fetchDraft: async () => draft,
        decodeInstruction: () => decodedJoin,
        authorizeSettlement: async () => true,
        commitInstructions,
        fetchCommittedStatus,
        wait,
      },
    });

    expect(commitInstructions).toHaveBeenCalledTimes(1);
    expect(fetchCommittedStatus).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      sequence: 9,
      tx_hash_hex: "ab".repeat(32),
      finality: FINALITY,
    });
  });

  it("does not touch the pipeline when the authenticated draft is malformed", async () => {
    const commitInstructions = vi.fn();
    await expect(
      executeSoraCloudHfDraftToCommit({
        expected,
        minimumSequenceExclusive: 0,
        dependencies: {
          fetchDraft: async () => ({ ...draft, authority: "testuOther" }),
          decodeInstruction: () => decodedJoin,
          authorizeSettlement: async () => true,
          commitInstructions,
          fetchCommittedStatus: async () => status(1),
          wait: async () => undefined,
        },
      }),
    ).rejects.toThrow("authority does not match");
    expect(commitInstructions).not.toHaveBeenCalled();
  });

  it("rejects an unreviewed compute profile before quoting, signing, or submitting", async () => {
    const commitInstructions = vi.fn();
    await expect(
      executeSoraCloudHfDraftToCommit({
        expected,
        minimumSequenceExclusive: 0,
        dependencies: {
          fetchDraft: async () => draft,
          decodeInstruction: () => ({
            JoinSoracloudHfSharedLease: {
              ...decodedJoin.JoinSoracloudHfSharedLease,
              resource_profile: { required_model_bytes: 1 },
            },
          }),
          authorizeSettlement: async () => true,
          commitInstructions,
          fetchCommittedStatus: async () => status(1),
          wait: async () => undefined,
        },
      }),
    ).rejects.toThrow("resource_profile");
    expect(commitInstructions).not.toHaveBeenCalled();
  });

  it("returns a finalized indexing receipt instead of claiming settlement confirmation when live state mismatches", async () => {
    await expect(
      executeSoraCloudHfDraftToCommit({
        expected,
        minimumSequenceExclusive: 8,
        statusAttempts: 2,
        statusPollIntervalMs: 0,
        dependencies: {
          fetchDraft: async () => draft,
          decodeInstruction: () => decodedJoin,
          authorizeSettlement: async () => true,
          commitInstructions: async () => ({
            hash: TX_HASH,
            finality: FINALITY,
          }),
          fetchCommittedStatus: async () => status(9, "foreign-service"),
          wait: async () => undefined,
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      settlement_status: "indexing",
      tx_hash_hex: TX_HASH,
      finality: FINALITY,
      action: null,
      sequence: null,
    });
  });
});
