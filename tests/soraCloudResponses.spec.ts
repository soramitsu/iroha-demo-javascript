import { describe, expect, it, vi } from "vitest";

import {
  buildSoraCloudCommittedLaunchResponse,
  decodeMatchingSoraCloudHfStatus,
  decodeSoraCloudHfDraftInstructions,
  decodeSoraCloudHfMutationDraft,
  readSoraCloudHfLatestSequence,
  SORACLOUD_HF_DEPLOY_APARTMENT_WIRE_ID,
  SORACLOUD_HF_DEPLOY_SERVICE_WIRE_ID,
  SORACLOUD_HF_JOIN_WIRE_ID,
  type SoraCloudHfDeployExpectation,
} from "../electron/soraCloudResponses";

const ACCOUNT_ID = "testuReviewedAccount";
const SIGNER = `ed0120${"11".repeat(32)}`;
const TX_HASH = "cd".repeat(32);
const FINALITY = {
  status: "finalized" as const,
  transactionHash: TX_HASH,
  blockHeight: 21,
  blockHash: "ef".repeat(32),
  finalizedBlockHeight: 21,
};
const RESOURCE_PROFILE = {
  required_model_bytes: 1_073_741_824,
  backend_family: { backend_family: "Transformers", value: null },
  model_format: { model_format: "Safetensors", value: null },
  disk_cache_bytes_floor: 2_147_483_648,
  ram_bytes_floor: 4_294_967_296,
  vram_bytes_floor: 0,
};
const SETTLEMENT = {
  leaseAssetDefinitionId: "4cuvDVPuLBKJyN6dPbRQhmLh68sU",
  storageBaseFee: "0.00001",
  maxComputeReservationFee: "0.0000075",
  resourceProfile: {
    requiredModelBytes: 1_073_741_824,
    backendFamily: "Transformers" as const,
    modelFormat: "Safetensors" as const,
    diskCacheBytesFloor: 2_147_483_648,
    ramBytesFloor: 4_294_967_296,
    vramBytesFloor: 0,
  },
};

const expected = (): SoraCloudHfDeployExpectation => ({
  accountId: ACCOUNT_ID,
  signer: SIGNER,
  joinProvenance: { signer: SIGNER, signature: "AA==" },
  generatedServiceProvenance: { signer: SIGNER, signature: "AA==" },
  generatedApartmentProvenance: { signer: SIGNER, signature: "AA==" },
  repoId: "openai/demo-model",
  resolvedRevision: "main",
  modelName: "demo-model",
  serviceName: "demo_model_service",
  apartmentName: "demo_agent",
  storageClass: "warm",
  leaseTermMs: 86_400_000,
  leaseAssetDefinitionId: "4cuvDVPuLBKJyN6dPbRQhmLh68sU",
  baseFee: "0.00001",
});

const joinInstruction = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  JoinSoracloudHfSharedLease: {
    repo_id: "openai/demo-model",
    resolved_revision: "main",
    model_name: "demo-model",
    service_name: "demo_model_service",
    apartment_name: "demo_agent",
    storage_class: { type: "Warm", value: null },
    lease_term_ms: 86_400_000,
    lease_asset_definition_id: "4cuvDVPuLBKJyN6dPbRQhmLh68sU",
    base_fee: "0.00001",
    resource_profile: RESOURCE_PROFILE,
    max_compute_reservation_fee: "0.0000075",
    provenance: { signer: SIGNER, signature: "AA==" },
    ...overrides,
  },
});

const serviceInstruction = (): Record<string, unknown> => ({
  DeploySoracloudService: {
    bundle: {
      service: {
        service_name: "demo_model_service",
        service_version: "hf.generated.v1",
      },
      container: {
        env: {
          SORACLOUD_HF_GENERATED: "1",
          SORACLOUD_HF_SOURCE_ID: "source-id",
          SORACLOUD_HF_REPO_ID: "openai/demo-model",
          SORACLOUD_HF_REVISION: "main",
          SORACLOUD_HF_MODEL_NAME: "demo-model",
        },
      },
    },
    initial_service_configs: {},
    initial_service_secrets: {},
    provenance: { signer: SIGNER, signature: "AA==" },
  },
});

const apartmentInstruction = (): Record<string, unknown> => ({
  DeploySoracloudAgentApartment: {
    manifest: { apartment_name: "demo_agent" },
    lease_ticks: 86_400,
    autonomy_budget_units: 1_000,
    provenance: { signer: SIGNER, signature: "AA==" },
  },
});

const draftResponse = () => ({
  ok: true,
  authority: ACCOUNT_ID,
  signed_by: SIGNER,
  tx_instructions: [
    {
      wire_id: SORACLOUD_HF_DEPLOY_SERVICE_WIRE_ID,
      payload_hex: "01",
    },
    {
      wire_id: SORACLOUD_HF_DEPLOY_APARTMENT_WIRE_ID,
      payload_hex: "02",
    },
    {
      wire_id: SORACLOUD_HF_JOIN_WIRE_ID,
      payload_hex: "03",
    },
  ],
});

const statusResponse = (sequence = 12) => ({
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
    status: { status: "Ready", value: null },
    created_at_ms: 100,
    updated_at_ms: 110,
    last_error: null,
  },
  runtime_projection: null,
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
    service_bindings: ["demo_model_service"],
    apartment_bindings: ["demo_agent"],
  },
  placement: null,
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
    service_name: "demo_model_service",
    apartment_name: "demo_agent",
  },
  audit_event_count: 1,
  storage_base_fee: "0.00001",
  compute_reservation_fee: "0",
  eligible_host_count: 1,
  warm_host_count: 1,
  importer_pending: false,
});

describe("SoraCloud HF draft boundary", () => {
  it("accepts only the exact authenticated draft and reviewed instruction set", () => {
    const draft = decodeSoraCloudHfMutationDraft(
      draftResponse(),
      ACCOUNT_ID,
      SIGNER,
    );
    const decode = vi.fn((bytes: Uint8Array) => {
      if (bytes[0] === 1) return serviceInstruction();
      if (bytes[0] === 2) return apartmentInstruction();
      return joinInstruction();
    });

    expect(
      decodeSoraCloudHfDraftInstructions(draft, expected(), decode),
    ).toMatchObject({
      instructions: expect.any(Array),
      settlement: SETTLEMENT,
    });
    expect(decode).toHaveBeenCalledTimes(3);
  });

  it("rejects authority, signer, field, and instruction-sequence drift", () => {
    expect(() =>
      decodeSoraCloudHfMutationDraft(
        { ...draftResponse(), authority: "testuOther" },
        ACCOUNT_ID,
        SIGNER,
      ),
    ).toThrow("authority does not match");
    expect(() =>
      decodeSoraCloudHfMutationDraft(
        { ...draftResponse(), signed_by: `ed0120${"22".repeat(32)}` },
        ACCOUNT_ID,
        SIGNER,
      ),
    ).toThrow("signed_by does not match");
    expect(() =>
      decodeSoraCloudHfMutationDraft(
        { ...draftResponse(), committed: true },
        ACCOUNT_ID,
        SIGNER,
      ),
    ).toThrow("unexpected committed");
    expect(() =>
      decodeSoraCloudHfMutationDraft(
        {
          ...draftResponse(),
          tx_instructions: [
            {
              wire_id: SORACLOUD_HF_JOIN_WIRE_ID,
              payload_hex: "03",
            },
            {
              wire_id: SORACLOUD_HF_DEPLOY_SERVICE_WIRE_ID,
              payload_hex: "01",
            },
          ],
        },
        ACCOUNT_ID,
        SIGNER,
      ),
    ).toThrow("must end with exactly one HF join");
  });

  it("rejects a decoded join that changes any reviewed settlement field", () => {
    const draft = decodeSoraCloudHfMutationDraft(
      {
        ...draftResponse(),
        tx_instructions: [
          {
            wire_id: SORACLOUD_HF_JOIN_WIRE_ID,
            payload_hex: "03",
          },
        ],
      },
      ACCOUNT_ID,
      SIGNER,
    );
    expect(() =>
      decodeSoraCloudHfDraftInstructions(draft, expected(), () =>
        joinInstruction({ base_fee: "999" }),
      ),
    ).toThrow("base_fee does not match");
    expect(() =>
      decodeSoraCloudHfDraftInstructions(draft, expected(), () =>
        joinInstruction({
          provenance: { signer: SIGNER, signature: "BB==" },
        }),
      ),
    ).toThrow("provenance.signature does not match");
    expect(() =>
      decodeSoraCloudHfDraftInstructions(draft, expected(), () =>
        joinInstruction({
          resource_profile: { required_model_bytes: 1 },
        }),
      ),
    ).toThrow("resource_profile");
  });
});

describe("SoraCloud committed HF status boundary", () => {
  it("requires a newer matching authoritative member and audit event", () => {
    const status = decodeMatchingSoraCloudHfStatus(
      statusResponse(12),
      expected(),
      SETTLEMENT,
      11,
    );
    expect(status).toMatchObject({
      action: "CreateWindow",
      sequence: 12,
    });
    expect(readSoraCloudHfLatestSequence(statusResponse(12))).toBe(12);

    expect(
      buildSoraCloudCommittedLaunchResponse({
        status,
        serviceName: "demo_model_service",
        transactionHash: TX_HASH,
        finality: FINALITY,
      }),
    ).toMatchObject({
      ok: true,
      service_name: "demo_model_service",
      sequence: 12,
      tx_hash_hex: TX_HASH,
      finality: FINALITY,
    });
  });

  it("rejects stale, foreign, and malformed-200 live output", () => {
    expect(() =>
      decodeMatchingSoraCloudHfStatus(
        statusResponse(12),
        expected(),
        SETTLEMENT,
        12,
      ),
    ).toThrow("has not advanced");

    const foreign = statusResponse(13);
    foreign.latest_audit_event.account_id = "testuOther";
    expect(() =>
      decodeMatchingSoraCloudHfStatus(foreign, expected(), SETTLEMENT, 12),
    ).toThrow("account_id does not match");

    expect(() =>
      decodeMatchingSoraCloudHfStatus(
        { ...statusResponse(13), invented_success: true },
        expected(),
        SETTLEMENT,
        12,
      ),
    ).toThrow("unexpected invented_success");

    expect(() =>
      decodeMatchingSoraCloudHfStatus(
        { ...statusResponse(13), compute_reservation_fee: "1" },
        expected(),
        SETTLEMENT,
        12,
      ),
    ).toThrow("compute_reservation_fee exceeds the reviewed maximum");
  });

  it("never constructs success around a noncanonical transaction hash", () => {
    const status = decodeMatchingSoraCloudHfStatus(
      statusResponse(12),
      expected(),
      SETTLEMENT,
      11,
    );
    expect(() =>
      buildSoraCloudCommittedLaunchResponse({
        status,
        serviceName: "demo_model_service",
        transactionHash: "0x1234",
        finality: FINALITY,
      }),
    ).toThrow("canonical lowercase 32-byte");
  });
});
