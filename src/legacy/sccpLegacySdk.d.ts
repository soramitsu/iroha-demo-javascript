/**
 * Accurate compatibility declarations for the non-Solana legacy SCCP snapshot.
 * Extracted as a transitive type closure from hyperledger-iroha/iroha commit
 * 7ea1b72ad250245c0af1f77950d45fec6ded7d89, javascript/iroha_js/index.d.ts.
 * Matching JS source SHA-256: 53760f42fdf44a9e0902431e0bd67ab9f94ab83b4c4d89e181e8349634d16edf.
 * Only symbols imported by this app are retained. Exact first-release Solana
 * symbols below are re-exported from the current SDK and are not declared here.
 */

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export const SCCP_DOMAIN_TON: number;

export const SCCP_DOMAIN_TRON: number;

export const SCCP_CODEC_TEXT_UTF8: 1;

export const SCCP_CODEC_EVM_HEX: 2;

export const SCCP_CODEC_TON_RAW: 4;

export const SCCP_CODEC_TRON_BASE58CHECK: 5;

export const SCCP_STARK_FRI_PROOF_FAMILY_V1: string;

export const SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1: "evm-groth16-bn254-v1";

export const SCCP_NATIVE_EVM_PROVER_BUNDLE_SCHEMA_V1: "sccp-native-evm-groth16-prover-bundle-v1";

export const SCCP_ETH_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1: "sccp-ethereum-mainnet-native-evm-cross-sdk-parity-v1";

export const SCCP_ETH_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1: "sccp-ethereum-mainnet-native-evm-prover-self-test-v1";

export const SCCP_ETH_NATIVE_EVM_PROVER_BUNDLE_ID_V1: "sccp:eth:native-evm-groth16-prover:ethereum-mainnet:v1";

export const SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1: "sccp-bsc-testnet-native-evm-cross-sdk-parity-v1";

export const SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1: "sccp-bsc-testnet-native-evm-prover-self-test-v1";

export const SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1: "sccp:bsc:native-evm-groth16-prover:bsc-testnet:v1";

export const SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1: "sccp-bsc-mainnet-native-evm-cross-sdk-parity-v1";

export const SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1: "sccp-bsc-mainnet-native-evm-prover-self-test-v1";

export const SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1: "sccp:bsc:native-evm-groth16-prover:bsc-mainnet:v1";

export const SCCP_BSC_GROTH16_PROOF_SELF_TEST_SCHEMA_V1: "iroha-sccp-bsc-groth16-proof-self-test/v1";

export const SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1: Readonly<{
  javascript: "pure-typescript";
  swift: "native-swift";
  kotlin: "native-kotlin";
  "java-android": "native-java";
  dotnet: "native-csharp";
}>;

export const SCCP_NATIVE_EVM_PROVER_ARTIFACT_HASH_ALGORITHM_V1: "sha256";

export const SCCP_GROTH16_BN254_PROOF_ABI_BYTE_LENGTH_V1: 384;

export const SCCP_EVM_CONTRACT_CALL_ABI_TUPLE_V1: "abi_tuple_v1";

export const SCCP_TRON_CONTRACT_CALL_ABI_TUPLE_V1: "tron_abi_tuple_v1";

export const SCCP_SUBMIT_MESSAGE_PROOF_ABI_V1: "submitSccpMessageProof(bytes,bytes32[6],bytes32)";

export const SCCP_TON_CONTRACT_PROOF_BACKEND_V1: "ton-contract-v1";

export const SCCP_TON_MESSAGE_BODY_BOC_V1: string;

export const SCCP_TON_WALLET_PAYLOAD_SAFE_BYTES_V1: number;

export const SCCP_TRON_GROTH16_BN254_PROOF_BACKEND_V1: "tron-groth16-bn254-v1";

export const SCCP_TAIRA_TRON_XOR_ROUTE_ID_V1: "taira_tron_xor";

export const SCCP_TAIRA_BSC_XOR_ROUTE_ID_V1: "taira_bsc_xor";

export const SCCP_TAIRA_TON_XOR_ROUTE_ID_V1: "taira_ton_xor";

export const SCCP_TAIRA_XOR_ASSET_KEY_V1: "xor";

export const TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1: "finalizeFromTaira(bytes,bytes32[6],bytes32,bytes)";

export const TAIRA_XOR_BURN_TO_TAIRA_ABI_V1: "burnToTaira(bytes32,bytes32,bytes,uint256)";

export interface SccpTransferPayload {
  version: number;
  source_domain: number;
  dest_domain: number;
  nonce: string | number | bigint;
  asset_home_domain: number;
  asset_id_codec: number;
  asset_id: string | BinaryLike | number[];
  amount: string | number | bigint;
  sender_codec: number;
  sender: string | BinaryLike | number[];
  recipient_codec: number;
  recipient: string | BinaryLike | number[];
  route_id_codec: number;
  route_id: string | BinaryLike | number[];
}

export interface TairaXorTransferPayloadInput {
  routeId?: string;
  route_id?: string;
  assetKey?: string;
  asset_key?: string;
  assetId?: string;
  asset_id?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  sender?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaSender?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_sender?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaAccountId?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_account_id?: string;
  recipientAddress?: string;
  recipient_address?: string;
  recipient?: string;
  amount: string | number | bigint;
  nonce: string | number | bigint;
}

export interface TairaXorTronToTairaTransferPayloadInput {
  routeId?: string;
  route_id?: string;
  assetKey?: string;
  asset_key?: string;
  assetId?: string;
  asset_id?: string;
  tronSender?: string;
  tron_sender?: string;
  sender?: string;
  senderAddress?: string;
  sender_address?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaRecipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_recipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  recipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaAccountId?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_account_id?: string;
  amount: string | number | bigint;
  nonce: string | number | bigint;
}

export interface TairaXorBscToTairaTransferPayloadInput {
  routeId?: string;
  route_id?: string;
  assetKey?: string;
  asset_key?: string;
  assetId?: string;
  asset_id?: string;
  bscSender?: string;
  bsc_sender?: string;
  evmSender?: string;
  evm_sender?: string;
  sender?: string;
  senderAddress?: string;
  sender_address?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaRecipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_recipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  recipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaAccountId?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_account_id?: string;
  amount: string | number | bigint;
  nonce: string | number | bigint;
}

export interface TairaXorTonToTairaTransferPayloadInput {
  routeId?: string;
  route_id?: string;
  assetKey?: string;
  asset_key?: string;
  assetId?: string;
  asset_id?: string;
  /** Canonical TON raw address in 0:<64 lowercase hex> form. */
  tonSender?: string;
  /** Canonical TON raw address in 0:<64 lowercase hex> form. */
  ton_sender?: string;
  /** Canonical TON raw address in 0:<64 lowercase hex> form. */
  sender?: string;
  /** Canonical TON raw address in 0:<64 lowercase hex> form. */
  senderAddress?: string;
  /** Canonical TON raw address in 0:<64 lowercase hex> form. */
  sender_address?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaRecipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_recipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  recipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaAccountId?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_account_id?: string;
  amount: string | number | bigint;
  nonce: string | number | bigint;
}

export interface TairaXorTronToTairaSettlementFragment {
  entrypoint?: "finalize_inbound";
  route?: "taira_tron_xor";
  route_id?: "taira_tron_xor";
  payload?: never;
  payload_json?: never;
  payloadJson?: never;
  payload_bytes?: never;
  payloadBytes?: never;
  [key: string]: unknown;
}

export interface TairaXorBscToTairaSettlementFragment {
  entrypoint?: "finalize_inbound";
  route?: "taira_bsc_xor";
  route_id?: "taira_bsc_xor";
  payload?: never;
  payload_json?: never;
  payloadJson?: never;
  payload_bytes?: never;
  payloadBytes?: never;
  [key: string]: unknown;
}

export interface TairaXorTonToTairaSettlementFragment {
  entrypoint?: "finalize_inbound";
  route?: "taira_ton_xor";
  route_id?: "taira_ton_xor";
  payload?: never;
  payload_json?: never;
  payloadJson?: never;
  payload_bytes?: never;
  payloadBytes?: never;
  [key: string]: unknown;
}

export interface TairaXorTronToTairaSourceProofPackageInput {
  proofPackage?: Record<string, unknown>;
  proof_package?: Record<string, unknown>;
  txId?: string;
  txID?: string;
  transactionId?: string;
  transaction_id?: string;
  tronSender?: string;
  tron_sender?: string;
  sender?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaRecipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_recipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  recipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaAccountId?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_account_id?: string;
  amount: string | number | bigint;
  /** Optional TRON bridge contract address; when supplied, sourceEventDigest is bound to the burn event. */
  bridgeAddress?: string | BinaryLike | number[];
  bridge_address?: string | BinaryLike | number[];
  tronBridgeAddress?: string | BinaryLike | number[];
  tron_bridge_address?: string | BinaryLike | number[];
  settlementDefaults?: TairaXorTronToTairaSettlementFragment;
  settlement_defaults?: TairaXorTronToTairaSettlementFragment;
}

export interface TairaXorBscToTairaSourceProofPackageInput {
  proofPackage?: Record<string, unknown>;
  proof_package?: Record<string, unknown>;
  txId?: string;
  txID?: string;
  transactionHash?: string;
  transaction_hash?: string;
  transactionId?: string;
  transaction_id?: string;
  bscSender?: string;
  bsc_sender?: string;
  evmSender?: string;
  evm_sender?: string;
  sender?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaRecipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_recipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  recipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaAccountId?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_account_id?: string;
  amount: string | number | bigint;
  /** Optional BSC bridge contract address; when supplied, sourceEventDigest is bound to the burn event. */
  bridgeAddress?: string | BinaryLike | number[];
  bridge_address?: string | BinaryLike | number[];
  bscBridgeAddress?: string | BinaryLike | number[];
  bsc_bridge_address?: string | BinaryLike | number[];
  evmBridgeAddress?: string | BinaryLike | number[];
  evm_bridge_address?: string | BinaryLike | number[];
  settlementDefaults?: TairaXorBscToTairaSettlementFragment;
  settlement_defaults?: TairaXorBscToTairaSettlementFragment;
}

export interface TairaXorTonToTairaSourceProofPackageInput {
  proofPackage?: Record<string, unknown>;
  proof_package?: Record<string, unknown>;
  txId?: string;
  txID?: string;
  transactionHash?: string;
  transaction_hash?: string;
  transactionId?: string;
  transaction_id?: string;
  /** Canonical TON raw address in 0:<64 lowercase hex> form. */
  tonSender?: string;
  /** Canonical TON raw address in 0:<64 lowercase hex> form. */
  ton_sender?: string;
  /** Canonical TON raw address in 0:<64 lowercase hex> form. */
  sender?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaRecipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_recipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  recipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaAccountId?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_account_id?: string;
  amount: string | number | bigint;
  settlementDefaults?: TairaXorTonToTairaSettlementFragment;
  settlement_defaults?: TairaXorTonToTairaSettlementFragment;
}

export interface BscSourceChainProofEnvelopeInput {
  messageId?: string;
  message_id?: string;
  payloadHash?: string;
  payload_hash?: string;
  commitmentRoot?: string;
  commitment_root?: string;
  sourceEventDigest?: string;
  source_event_digest?: string;
  sourceBridgeEmitterAddress?: string | BinaryLike | number[];
  source_bridge_emitter_address?: string | BinaryLike | number[];
  sourceBridgeEmitterCodeHash?: string | BinaryLike | number[];
  source_bridge_emitter_code_hash?: string | BinaryLike | number[];
  receipt?: Record<string, unknown>;
  block?: Record<string, unknown>;
  blockReceipts?: readonly Record<string, unknown>[];
  block_receipts?: readonly Record<string, unknown>[];
  receiptRootIndex?: string | number | bigint;
  receipt_root_index?: string | number | bigint;
  transactionIndex?: string | number | bigint;
  transaction_index?: string | number | bigint;
  finalityHeight?: string | number | bigint;
  finality_height?: string | number | bigint;
  blockNumber?: string | number | bigint;
  block_number?: string | number | bigint;
  finalityBlockHash?: string;
  finality_block_hash?: string;
  blockHash?: string;
  block_hash?: string;
  sourceVerifierMaterial?: Record<string, unknown>;
  source_verifier_material?: Record<string, unknown>;
  bscSourceVerifierMaterial?: Record<string, unknown>;
  bsc_source_verifier_material?: Record<string, unknown>;
  sccpSourceVerifierMaterial?: Record<string, unknown>;
  sccp_source_verifier_material?: Record<string, unknown>;
  sourceAdapterEngineDeployment?: Record<string, unknown>;
  source_adapter_engine_deployment?: Record<string, unknown>;
  sourceAdapterDeployment?: Record<string, unknown>;
  source_adapter_deployment?: Record<string, unknown>;
  bscSourceAdapterEngineDeployment?: Record<string, unknown>;
  bsc_source_adapter_engine_deployment?: Record<string, unknown>;
  bscSourceAdapterDeployment?: Record<string, unknown>;
  bsc_source_adapter_deployment?: Record<string, unknown>;
  sourceTrustAnchorHash?: string;
  source_trust_anchor_hash?: string;
  sourceBridgeNetworkId?: string;
  source_bridge_network_id?: string;
  sourceBridgeOwnerAddress?: string | BinaryLike | number[];
  source_bridge_owner_address?: string | BinaryLike | number[];
  sourceBridgeConfigHash?: string;
  source_bridge_config_hash?: string;
  sourceAdapterDeploymentHash?: string;
  source_adapter_deployment_hash?: string;
  sourceAdapterEngineDeploymentHash?: string;
  source_adapter_engine_deployment_hash?: string;
  sourceAdapterDeploymentReceiptHash?: string;
  source_adapter_deployment_receipt_hash?: string;
  deploymentReceiptHash?: string;
  deployment_receipt_hash?: string;
  sourceValidatorPrivateKeys?:
    | string
    | BinaryLike
    | number[]
    | readonly (string | BinaryLike | number[])[];
  source_validator_private_keys?:
    | string
    | BinaryLike
    | number[]
    | readonly (string | BinaryLike | number[])[];
  validatorPrivateKeys?:
    | string
    | BinaryLike
    | number[]
    | readonly (string | BinaryLike | number[])[];
  validator_private_keys?:
    | string
    | BinaryLike
    | number[]
    | readonly (string | BinaryLike | number[])[];
  sourceValidatorPowers?: readonly (string | number | bigint)[];
  source_validator_powers?: readonly (string | number | bigint)[];
  validatorPowers?: readonly (string | number | bigint)[];
  validator_powers?: readonly (string | number | bigint)[];
}

export interface BscSourceChainProofEnvelopeResult {
  readonly sourceProofHex: string;
  readonly sourceProofBytes: Uint8Array;
  readonly sourceEventDigest: string;
  readonly observedSourceEventDigest: string;
  readonly sourceEventLeafHash: string;
  readonly receiptOrMessageRoot: string;
  readonly finalityHeight: string;
  readonly finalityBlockHash: string;
  readonly receiptsRoot: string;
  readonly validatorSetHash: string;
  readonly receiptRootIndex: string;
  readonly syntheticRootMarker: boolean;
}

export interface TairaXorTronToTairaBoundSourceProofPackage {
  readonly messageBundle: Record<string, unknown>;
  readonly settlement: Readonly<
    Record<string, unknown> & {
      entrypoint: "finalize_inbound";
      route: "taira_tron_xor";
    }
  >;
  readonly sourceEventDigest: string;
  readonly txId: string;
  readonly messageId: string;
  readonly commitmentRoot: string;
  readonly amount: string;
}

export interface TairaXorBscToTairaBoundSourceProofPackage {
  readonly messageBundle: Record<string, unknown>;
  readonly settlement: Readonly<
    Record<string, unknown> & {
      entrypoint: "finalize_inbound";
      route: "taira_bsc_xor";
    }
  >;
  readonly sourceEventDigest: string;
  readonly txId: string;
  readonly messageId: string;
  readonly commitmentRoot: string;
  readonly amount: string;
}

export interface TairaXorTonToTairaBoundSourceProofPackage {
  readonly messageBundle: Record<string, unknown>;
  readonly settlement: Readonly<
    Record<string, unknown> & {
      entrypoint: "finalize_inbound";
      route: "taira_ton_xor";
    }
  >;
  readonly sourceEventDigest: string;
  readonly txId: string;
  readonly messageId: string;
  readonly commitmentRoot: string;
  readonly amount: string;
}

export interface TairaXorTronBurnStartedEventInput
  extends TairaXorRouteHashInput {
  event: Record<string, unknown>;
  sourceEventDigest?: string;
  source_event_digest?: string;
  expectedSourceEventDigest?: string;
  expected_source_event_digest?: string;
  burnerAddress?: string | BinaryLike | number[];
  burner_address?: string | BinaryLike | number[];
  burner?: string | BinaryLike | number[];
  tronSender?: string | BinaryLike | number[];
  tron_sender?: string | BinaryLike | number[];
  sender?: string | BinaryLike | number[];
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaRecipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_recipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  recipient?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaAccountId?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_account_id?: string;
  amount?: string | number | bigint;
  /** Optional TRON bridge contract address; when supplied, sourceEventDigest is recomputed from event fields. */
  bridgeAddress?: string | BinaryLike | number[];
  bridge_address?: string | BinaryLike | number[];
  tronBridgeAddress?: string | BinaryLike | number[];
  tron_bridge_address?: string | BinaryLike | number[];
}

export interface TairaXorTronBoundBurnStartedEvent {
  readonly eventName: "tairaxorburnstarted" | "burntotaira";
  readonly sourceEventDigest: string;
  readonly routeIdHash: string;
  readonly assetKeyHash: string;
  readonly bridgeAddress: string | null;
  readonly burnerAddress: string;
  readonly tairaRecipient: string;
  readonly tairaRecipientHash: string;
  readonly amount: string;
  readonly nonce: string;
}

export interface TairaXorSccpRecordDescriptorInput
  extends TairaXorTransferPayloadInput {
  chainId?: string;
  chain_id?: string;
  tairaChainId?: string;
  taira_chain_id?: string;
  networkPrefix?: string | number | bigint;
  network_prefix?: string | number | bigint;
  tairaNetworkPrefix?: string | number | bigint;
  taira_network_prefix?: string | number | bigint;
  expectedMessageId?: string;
  expected_message_id?: string;
  messageId?: string;
  message_id?: string;
  expectedCanonicalPayloadBytes?: BinaryLike | number[];
  expected_canonical_payload_bytes?: BinaryLike | number[];
  expectedCanonicalPayloadHex?: string;
  expected_canonical_payload_hex?: string;
  expectedPayloadBytes?: BinaryLike | number[];
  expected_payload_bytes?: BinaryLike | number[];
}

export interface TairaXorBscSccpRecordDescriptorInput
  extends TairaXorSccpRecordDescriptorInput {
  bscRecipient?: string;
  bsc_recipient?: string;
  evmRecipient?: string;
  evm_recipient?: string;
}

export interface TairaXorTonSccpRecordDescriptorInput
  extends TairaXorSccpRecordDescriptorInput {
  /** Canonical TON raw address in 0:<64 lowercase hex> form. */
  tonRecipient?: string;
  /** Canonical TON raw address in 0:<64 lowercase hex> form. */
  ton_recipient?: string;
}

export interface TairaXorSccpRecordDescriptor {
  readonly version: 1;
  readonly kind: "TairaXorSccpRecordDescriptor";
  readonly execution_kind: "ivm_proved_record_sccp_message_v1";
  readonly chain_id: "809574f5-fee7-5e69-bfcf-52451e42d50f";
  readonly network_prefix: 369;
  readonly route_id: "taira_tron_xor";
  readonly asset_key: "xor";
  readonly message_kind: "Transfer";
  readonly source_domain: number;
  readonly dest_domain: number;
  readonly message_id: string;
  readonly canonical_payload_hex: string;
  readonly canonicalPayloadBytes: Uint8Array;
  readonly payload: Readonly<SccpTransferPayload>;
  readonly record_instruction: Readonly<{
    kind: "RecordSccpMessage";
    payload_bytes_hex: string;
  }>;
  readonly execution_requirements: Readonly<{
    executable: "IvmProved";
    overlay_instruction: "RecordSccpMessage";
    settlement_instruction: "Burn<Numeric, Asset>";
    settlement_asset_selector: "nexus.fees.fee_asset_id";
    settlement_asset_key: "xor";
    settlement_account_binding: "burn.destination.account == payload.sender";
    settlement_amount_binding: "sum(whole-unit burns) >= sum(recorded amounts) per sender";
    proof_gate: "sccp_recording_proof_verified";
    normal_transaction_supported: false;
  }>;
}

export interface TairaXorBscSccpRecordDescriptor
  extends Omit<TairaXorSccpRecordDescriptor, "route_id"> {
  readonly route_id: "taira_bsc_xor";
}

export interface TairaXorTonSccpRecordDescriptor
  extends Omit<TairaXorSccpRecordDescriptor, "route_id"> {
  readonly route_id: "taira_ton_xor";
}

export interface TairaXorSccpBurnRecordInput
  extends TairaXorSccpRecordDescriptorInput {
  descriptor?: TairaXorSccpRecordDescriptor;
  recordDescriptor?: TairaXorSccpRecordDescriptor;
  record_descriptor?: TairaXorSccpRecordDescriptor;
  settlementAssetDefinitionId?: string;
  settlement_asset_definition_id?: string;
  settlementAsset?: string;
  settlement_asset?: string;
  settlementAmount?: string;
  settlement_amount?: string;
  burnAmount?: string;
  burn_amount?: string;
  authority?: string;
}

export interface TairaXorBscSccpBurnRecordInput
  extends TairaXorBscSccpRecordDescriptorInput {
  descriptor?: TairaXorBscSccpRecordDescriptor;
  recordDescriptor?: TairaXorBscSccpRecordDescriptor;
  record_descriptor?: TairaXorBscSccpRecordDescriptor;
  settlementAssetDefinitionId?: string;
  settlement_asset_definition_id?: string;
  settlementAsset?: string;
  settlement_asset?: string;
  settlementAmount?: string;
  settlement_amount?: string;
  burnAmount?: string;
  burn_amount?: string;
  authority?: string;
}

export interface TairaXorTonSccpBurnRecordInput
  extends TairaXorTonSccpRecordDescriptorInput {
  descriptor?: TairaXorTonSccpRecordDescriptor;
  recordDescriptor?: TairaXorTonSccpRecordDescriptor;
  record_descriptor?: TairaXorTonSccpRecordDescriptor;
  settlementAssetDefinitionId?: string;
  settlement_asset_definition_id?: string;
  settlementAsset?: string;
  settlement_asset?: string;
  settlementAmount?: string;
  settlement_amount?: string;
  burnAmount?: string;
  burn_amount?: string;
  authority?: string;
}

export interface TairaXorSccpBurnRecordContractPayload {
  readonly version: 1;
  readonly entrypoint: "burn_and_record";
  readonly descriptor: Readonly<TairaXorSccpRecordDescriptor>;
  readonly payload: Readonly<{
    sender: string;
    settlement_asset: string;
    amount: string;
    record_instruction: string;
  }>;
  readonly record_instruction_hex: string;
}

export interface TairaXorBscSccpBurnRecordContractPayload
  extends Omit<TairaXorSccpBurnRecordContractPayload, "descriptor"> {
  readonly descriptor: Readonly<TairaXorBscSccpRecordDescriptor>;
}

export interface TairaXorTonSccpBurnRecordContractPayload
  extends Omit<TairaXorSccpBurnRecordContractPayload, "descriptor"> {
  readonly descriptor: Readonly<TairaXorTonSccpRecordDescriptor>;
}

export interface TairaXorSccpBurnRecordZkIvmRequestInput
  extends TairaXorSccpBurnRecordInput {
  vkRef?: { backend?: string; name?: string };
  vk_ref?: { backend?: string; name?: string };
  bytecode?: string;
  artifactB64?: string;
  artifact_b64?: string;
  contractArtifact?: {
    artifact_b64?: string;
    artifactB64?: string;
    bytecode?: string;
  };
  contract_artifact?: {
    artifact_b64?: string;
    artifactB64?: string;
    bytecode?: string;
  };
  artifact?: { artifact_b64?: string; artifactB64?: string; bytecode?: string };
  gasLimit?: string | number | bigint;
  gas_limit?: string | number | bigint;
  metadata?: Record<string, JsonValue>;
}

export interface TairaXorBscSccpBurnRecordZkIvmRequestInput
  extends TairaXorBscSccpBurnRecordInput {
  vkRef?: { backend?: string; name?: string };
  vk_ref?: { backend?: string; name?: string };
  bytecode?: string;
  artifactB64?: string;
  artifact_b64?: string;
  contractArtifact?: {
    artifact_b64?: string;
    artifactB64?: string;
    bytecode?: string;
  };
  contract_artifact?: {
    artifact_b64?: string;
    artifactB64?: string;
    bytecode?: string;
  };
  artifact?: { artifact_b64?: string; artifactB64?: string; bytecode?: string };
  gasLimit?: string | number | bigint;
  gas_limit?: string | number | bigint;
  metadata?: Record<string, JsonValue>;
}

export interface TairaXorTonSccpBurnRecordZkIvmRequestInput
  extends TairaXorTonSccpBurnRecordInput {
  vkRef?: { backend?: string; name?: string };
  vk_ref?: { backend?: string; name?: string };
  bytecode?: string;
  artifactB64?: string;
  artifact_b64?: string;
  contractArtifact?: {
    artifact_b64?: string;
    artifactB64?: string;
    bytecode?: string;
  };
  contract_artifact?: {
    artifact_b64?: string;
    artifactB64?: string;
    bytecode?: string;
  };
  artifact?: { artifact_b64?: string; artifactB64?: string; bytecode?: string };
  gasLimit?: string | number | bigint;
  gas_limit?: string | number | bigint;
  metadata?: Record<string, JsonValue>;
}

export interface TairaXorSccpBurnRecordZkIvmRequest {
  readonly version: 1;
  readonly route_id: "taira_tron_xor";
  readonly asset_key: "xor";
  readonly descriptor: Readonly<TairaXorSccpRecordDescriptor>;
  readonly contract: Readonly<TairaXorSccpBurnRecordContractPayload>;
  readonly request: Readonly<{
    vkRef: Readonly<{ backend: string; name: string }>;
    authority: string;
    metadata: Readonly<Record<string, JsonValue>>;
    bytecode: string;
  }>;
}

export interface TairaXorBscSccpBurnRecordZkIvmRequest
  extends Omit<
    TairaXorSccpBurnRecordZkIvmRequest,
    "route_id" | "descriptor" | "contract"
  > {
  readonly route_id: "taira_bsc_xor";
  readonly descriptor: Readonly<TairaXorBscSccpRecordDescriptor>;
  readonly contract: Readonly<TairaXorBscSccpBurnRecordContractPayload>;
}

export interface TairaXorTonSccpBurnRecordZkIvmRequest
  extends Omit<
    TairaXorSccpBurnRecordZkIvmRequest,
    "route_id" | "descriptor" | "contract"
  > {
  readonly route_id: "taira_ton_xor";
  readonly descriptor: Readonly<TairaXorTonSccpRecordDescriptor>;
  readonly contract: Readonly<TairaXorTonSccpBurnRecordContractPayload>;
}

export type SccpHubMessageKind =
  | "Burn"
  | "TokenAdd"
  | "TokenPause"
  | "TokenResume"
  | "AssetRegister"
  | "RouteActivate"
  | "Transfer";

export interface SccpHubCommitment {
  version: number;
  kind: SccpHubMessageKind;
  target_domain: number;
  message_id: string;
  payload_hash: string;
}

export interface SccpMerkleStep {
  sibling_hash: string;
  sibling_is_left: boolean;
}

export interface SccpMerkleProof {
  steps: SccpMerkleStep[];
}

export type SccpDomainIdInput = number | string | bigint;

export type SccpVersionInput = 1 | "1" | 1n;

export interface SolanaSccpProofContextInput {
  statementHash?: string;
  statement_hash?: string;
  destinationBindingHash?: string;
  destination_binding_hash?: string;
  destinationBinding?:
    | TonSccpDestinationBindingInput
    | EvmSccpDestinationBindingInput
    | TronSccpDestinationBindingInput;
  destination_binding?:
    | TonSccpDestinationBindingInput
    | EvmSccpDestinationBindingInput
    | TronSccpDestinationBindingInput;
}

export interface SolanaSccpProofContext {
  version: 1;
  statementHash: string;
  destinationBindingHash: string;
}

export interface SccpSourceAdapterDeploymentBindingInput {
  sourceDomain?: SccpDomainIdInput;
  source_domain?: SccpDomainIdInput;
  targetDomain?: SccpDomainIdInput;
  target_domain?: SccpDomainIdInput;
  sourceAdapterDeploymentHash?: string;
  source_adapter_deployment_hash?: string;
  sourceAdapterDeploymentReceiptHash?: string;
  source_adapter_deployment_receipt_hash?: string;
}

export interface SccpSourceAdapterDeploymentBinding {
  version: 1;
  sourceDomain: number;
  targetDomain: number;
  sourceAdapterDeploymentHash: string;
  sourceAdapterDeploymentReceiptHash: string;
}

export type SccpDestinationBindingDomainInput =
  | SccpDomainIdInput
  | {
      targetDomain?: SccpDomainIdInput;
      target_domain?: SccpDomainIdInput;
      domain?: SccpDomainIdInput;
    };

export interface EvmSccpDestinationBindingInput {
  version?: SccpVersionInput;
  sourceDomain?: SccpDomainIdInput;
  source_domain?: SccpDomainIdInput;
  targetDomain?: SccpDomainIdInput;
  target_domain?: SccpDomainIdInput;
  networkId?: string;
  network_id?: string;
  networkIdHex?: string;
  network_id_hex?: string;
  verifierAddress?: string;
  verifier_address?: string;
  verifierAddressHex?: string;
  verifier_address_hex?: string;
  bridgeAddress?: string;
  bridge_address?: string;
  bridgeAddressHex?: string;
  bridge_address_hex?: string;
  verifierCodeHash?: string;
  verifier_code_hash?: string;
  verifierCodeHashHex?: string;
  verifier_code_hash_hex?: string;
  verifierKeyHash?: string;
  verifier_key_hash?: string;
  verifierKeyHashHex?: string;
  verifier_key_hash_hex?: string;
  verifierBackend?: typeof SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1;
  verifier_backend?: typeof SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1;
  backend?: typeof SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1;
  proofFamily?: typeof SCCP_STARK_FRI_PROOF_FAMILY_V1;
  proof_family?: typeof SCCP_STARK_FRI_PROOF_FAMILY_V1;
  key?: string;
  bindingKey?: string;
  binding_key?: string;
  bindingHash?: string;
  binding_hash?: string;
  destinationBindingHash?: string;
  destination_binding_hash?: string;
}

export interface EvmSccpDestinationBinding {
  readonly version: 1;
  readonly sourceDomain: number;
  readonly targetDomain: number;
  readonly networkId: string;
  readonly verifierAddress: string;
  readonly bridgeAddress: string;
  readonly verifierCodeHash: string;
  readonly verifierKeyHash: string;
  readonly verifierBackend: typeof SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1;
  readonly proofFamily: typeof SCCP_STARK_FRI_PROOF_FAMILY_V1;
  readonly key: string;
  readonly bindingHash: string;
}

export interface TronSccpDestinationBindingInput {
  version?: SccpVersionInput;
  sourceDomain?: SccpDomainIdInput;
  source_domain?: SccpDomainIdInput;
  targetDomain?: SccpDomainIdInput;
  target_domain?: SccpDomainIdInput;
  networkId?: string;
  network_id?: string;
  networkIdHex?: string;
  network_id_hex?: string;
  verifierAddress?: string;
  verifier_address?: string;
  verifierCodeHash?: string;
  verifier_code_hash?: string;
  verifierCodeHashHex?: string;
  verifier_code_hash_hex?: string;
  verifierKeyHash?: string;
  verifier_key_hash?: string;
  verifierKeyHashHex?: string;
  verifier_key_hash_hex?: string;
  verifierBackend?: typeof SCCP_TRON_GROTH16_BN254_PROOF_BACKEND_V1;
  verifier_backend?: typeof SCCP_TRON_GROTH16_BN254_PROOF_BACKEND_V1;
  backend?: typeof SCCP_TRON_GROTH16_BN254_PROOF_BACKEND_V1;
  proofFamily?: typeof SCCP_STARK_FRI_PROOF_FAMILY_V1;
  proof_family?: typeof SCCP_STARK_FRI_PROOF_FAMILY_V1;
  key?: string;
  bindingKey?: string;
  binding_key?: string;
  bindingHash?: string;
  binding_hash?: string;
  destinationBindingHash?: string;
  destination_binding_hash?: string;
}

export interface TronSccpDestinationBinding {
  readonly version: 1;
  readonly sourceDomain: number;
  readonly targetDomain: number;
  readonly networkId: string;
  readonly verifierAddress: string;
  readonly verifierCodeHash: string;
  readonly verifierKeyHash: string;
  readonly verifierBackend: typeof SCCP_TRON_GROTH16_BN254_PROOF_BACKEND_V1;
  readonly proofFamily: typeof SCCP_STARK_FRI_PROOF_FAMILY_V1;
  readonly key: string;
  readonly bindingHash: string;
}

export interface SccpSourceVerifierMaterialInput {
  sourceDomain?: SccpDomainIdInput;
  source_domain?: SccpDomainIdInput;
  targetDomain?: SccpDomainIdInput;
  target_domain?: SccpDomainIdInput;
  sourceTrustAnchorHash?: string;
  source_trust_anchor_hash?: string;
  consensusVerifierHash?: string;
  consensus_verifier_hash?: string;
  messageInclusionVerifierHash?: string;
  message_inclusion_verifier_hash?: string;
  finalityPolicyHash?: string;
  finality_policy_hash?: string;
  sourceStateVerifierHash?: string;
  source_state_verifier_hash?: string;
  sourceBridgeEmitterAddress?: string;
  source_bridge_emitter_address?: string;
  bridgeAddress?: string;
  bridge_address?: string;
  sourceBridgeEmitterCodeHash?: string;
  source_bridge_emitter_code_hash?: string;
  sourceBridgeNetworkId?: string;
  source_bridge_network_id?: string;
  networkId?: string;
  network_id?: string;
  sourceBridgeOwnerAddress?: string;
  source_bridge_owner_address?: string;
  ownerAddress?: string;
  owner_address?: string;
  sourceBridgeConfigHash?: string;
  source_bridge_config_hash?: string;
  configHash?: string;
  config_hash?: string;
}

export interface SccpSourceAdapterEngineDeploymentInput
  extends SccpSourceVerifierMaterialInput {
  adapterProofFamily?: string;
  adapter_proof_family?: string;
  adapterVerifierVkHash?: string;
  adapter_verifier_vk_hash?: string;
  solanaTowerReplayVerifierHash?: string;
  solana_tower_replay_verifier_hash?: string;
  solanaFullAccountsdbLatticeVerifierHash?: string;
  solana_full_accountsdb_lattice_verifier_hash?: string;
  solanaBankForkChoiceVerifierHash?: string;
  solana_bank_fork_choice_verifier_hash?: string;
  tonMasterchainConfigVerifierHash?: string;
  ton_masterchain_config_verifier_hash?: string;
  tonValidatorSetTransitionVerifierHash?: string;
  ton_validator_set_transition_verifier_hash?: string;
  tonShardAccountsDictionaryVerifierHash?: string;
  ton_shard_accounts_dictionary_verifier_hash?: string;
  deploymentReceiptHash?: string;
  deployment_receipt_hash?: string;
}

export interface TonSccpRouteCanaryEvidenceInput {
  routeAllowlistHash?: string;
  route_allowlist_hash?: string;
  destinationBindingHash?: string;
  destination_binding_hash?: string;
  expectedDestinationBindingHash?: string;
  expected_destination_binding_hash?: string;
  sourceVerifierMaterialHash?: string;
  source_verifier_material_hash?: string;
  sourceAdapterEngineDeploymentHash?: string;
  source_adapter_engine_deployment_hash?: string;
  verifierContractAddress?: string;
  verifier_contract_address?: string;
  verifierIdentity?: string;
  verifier_identity?: string;
  verifierCodeHash?: string;
  verifier_code_hash?: string;
  accountStatus?: "active";
  account_status?: "active";
  tonAccountStatus?: "active";
  ton_account_status?: "active";
  accountStateHash?: string;
  account_state_hash?: string;
  tonAccountStateHash?: string;
  ton_account_state_hash?: string;
  lastTransactionLt?: string;
  last_transaction_lt?: string;
  tonLastTransactionLt?: string;
  ton_last_transaction_lt?: string;
  lastTransactionHash?: string;
  last_transaction_hash?: string;
  tonLastTransactionHash?: string;
  ton_last_transaction_hash?: string;
  verifierCodeBocRootHash?: string;
  verifier_code_boc_root_hash?: string;
  tonVerifierCodeBocRootHash?: string;
  ton_verifier_code_boc_root_hash?: string;
}

export interface SccpMessageTransparentPublicInputsInput {
  version?: SccpVersionInput;
  messageId?: string;
  message_id?: string;
  payloadHash?: string;
  payload_hash?: string;
  targetDomain?: SccpDomainIdInput;
  target_domain?: SccpDomainIdInput;
  commitmentRoot?: string;
  commitment_root?: string;
  finalityHeight?: string | number | bigint;
  finality_height?: string | number | bigint;
  finalityBlockHash?: string;
  finality_block_hash?: string;
}

export interface TonSccpDestinationBindingInput {
  key: string;
  bindingHash?: string;
  binding_hash?: string;
}

export interface TonSccpManifestInput {
  version: SccpVersionInput;
  localDomain?: SccpDomainIdInput;
  local_domain?: SccpDomainIdInput;
  counterpartyDomain?: SccpDomainIdInput;
  counterparty_domain?: SccpDomainIdInput;
  securityModel?: "RecursiveZk";
  security_model?: "RecursiveZk";
  anchorGovernance?: "CryptographicProof";
  anchor_governance?: "CryptographicProof";
  verifierTarget?: "TonContract";
  verifier_target?: "TonContract";
  verifierBackendFamily?: "TonContract";
  verifier_backend_family?: "TonContract";
  proofFamily?: typeof SCCP_STARK_FRI_PROOF_FAMILY_V1;
  proof_family?: typeof SCCP_STARK_FRI_PROOF_FAMILY_V1;
  verifierBackendKey?: typeof SCCP_TON_CONTRACT_PROOF_BACKEND_V1;
  verifier_backend_key?: typeof SCCP_TON_CONTRACT_PROOF_BACKEND_V1;
  verifierBackend?: {
    key: typeof SCCP_TON_CONTRACT_PROOF_BACKEND_V1;
    family?: "TonContract";
  };
  verifier_backend?: {
    key: typeof SCCP_TON_CONTRACT_PROOF_BACKEND_V1;
    family?: "TonContract";
  };
  messageBackend?: string;
  message_backend?: string;
  registryBackend?: string;
  registry_backend?: string;
  manifestSeed?: string;
  manifest_seed?: string;
  destinationBinding?: TonSccpDestinationBindingInput;
  destination_binding?: TonSccpDestinationBindingInput;
}

export interface TonSccpProofRequestInput {
  publicInputs?: SccpMessageTransparentPublicInputsInput;
  public_inputs?: SccpMessageTransparentPublicInputsInput;
  bundleBytes?: BinaryLike;
  bundle_bytes?: BinaryLike;
  sourceProofBytes?: BinaryLike;
  source_proof_bytes?: BinaryLike;
  backend?: typeof SCCP_TON_CONTRACT_PROOF_BACKEND_V1;
  sourceDomain?: SccpDomainIdInput;
  source_domain?: SccpDomainIdInput;
  statementHash?: string;
  statement_hash?: string;
  destinationBindingHash?: string;
  destination_binding_hash?: string;
  destinationBinding?: TonSccpDestinationBindingInput;
  destination_binding?: TonSccpDestinationBindingInput;
  proofContext?: SolanaSccpProofContextInput;
  proof_context?: SolanaSccpProofContextInput;
  sourceStateVerifierId?: string;
  source_state_verifier_id?: string;
  sourceStateVerifierHash?: string;
  source_state_verifier_hash?: string;
  sourceAdapterDeploymentHash?: string;
  source_adapter_deployment_hash?: string;
  sourceAdapterDeploymentReceiptHash?: string;
  source_adapter_deployment_receipt_hash?: string;
  sourceAdapterDeployment?: SccpSourceAdapterEngineDeploymentInput;
  source_adapter_deployment?: SccpSourceAdapterEngineDeploymentInput;
  sourceAdapterDeploymentBinding?: SccpSourceAdapterDeploymentBindingInput;
  source_adapter_deployment_binding?: SccpSourceAdapterDeploymentBindingInput;
}

export interface TonSccpMessageBodyInputBase extends TonSccpProofRequestInput {
  proofBytes?: BinaryLike;
  proof_bytes?: BinaryLike;
  metadataBytes?: BinaryLike;
  metadata_bytes?: BinaryLike;
  manifest?: TonSccpManifestInput;
  queryId?: string | number | bigint;
  query_id?: string | number | bigint;
}

export interface TonSccpMessageBodyBytesInput {
  publicInputsBytes?: BinaryLike;
  public_inputs_bytes?: BinaryLike;
  proofBytes?: BinaryLike;
  proof_bytes?: BinaryLike;
  bundleBytes?: BinaryLike;
  bundle_bytes?: BinaryLike;
  metadataBytes?: BinaryLike;
  metadata_bytes?: BinaryLike;
  queryId?: string | number | bigint;
  query_id?: string | number | bigint;
  statementHash?: string;
  statement_hash?: string;
  destinationBindingHash?: string;
  destination_binding_hash?: string;
}

export interface TonSccpChunkedMessageBodyInput {
  messageBodyBocBytes?: BinaryLike;
  message_body_boc_bytes?: BinaryLike;
  messageBodyBocHex?: string;
  message_body_boc_hex?: string;
  messageId?: string;
  message_id?: string;
  queryId?: string | number | bigint;
  query_id?: string | number | bigint;
  statementHash?: string;
  statement_hash?: string;
  destinationBindingHash?: string;
  destination_binding_hash?: string;
  chunkSize?: number;
  chunk_size?: number;
}

export interface TonSccpChunkedUploadMessage {
  readonly index: number;
  readonly offset: number;
  readonly length: number;
  readonly chunkHash: string;
  readonly payloadBocHex: string;
  readonly payloadBocBytes: Uint8Array;
}

export interface TonSccpChunkedFinalizeMessage {
  readonly payloadBocHex: string;
  readonly payloadBocBytes: Uint8Array;
}

export interface TonSccpChunkedMessageBodyPlan {
  readonly version: 1;
  readonly protocol: "ton_sccp_chunked_message_body_boc_v1";
  readonly opChunk: number;
  readonly opFinalize: number;
  readonly messageId: string;
  readonly queryId: string;
  readonly totalBytes: number;
  readonly chunkSize: number;
  readonly chunkCount: number;
  readonly bodyHash: string;
  readonly chunkRoot: string;
  readonly uploadMessages: ReadonlyArray<TonSccpChunkedUploadMessage>;
  readonly finalizeMessage: TonSccpChunkedFinalizeMessage;
}

export type TonSccpMessageBodyInput = TonSccpMessageBodyInputBase &
  (
    | {
        proofResult: TonSccpProofResult;
        proof_result?: TonSccpProofResult;
      }
    | {
        proofResult?: TonSccpProofResult;
        proof_result: TonSccpProofResult;
      }
  );

export interface TonSccpProofRequest {
  readonly version: 1;
  readonly backend: typeof SCCP_TON_CONTRACT_PROOF_BACKEND_V1;
  readonly sourceDomain: typeof SCCP_DOMAIN_TON;
  readonly targetDomain: number;
  readonly publicInputs: Readonly<
    Required<{
      version: number;
      messageId: string;
      payloadHash: string;
      targetDomain: number;
      commitmentRoot: string;
      finalityHeight: string;
      finalityBlockHash: string;
    }>
  >;
  readonly publicInputsBytes: Uint8Array;
  readonly bundleBytes: Uint8Array;
  readonly sourceProofBytes: Uint8Array;
  readonly proofContext: Readonly<SolanaSccpProofContext>;
  readonly statementHash: string;
  readonly destinationBindingHash: string;
  readonly sourceStateVerifierId: string;
  readonly sourceStateVerifierHash: string;
  readonly sourceAdapterDeploymentBindingHash: string;
  readonly sourceAdapterDeploymentBinding: Readonly<SccpSourceAdapterDeploymentBinding>;
  readonly requestHash: string;
}

export interface TonSccpSubmission {
  readonly version: 1;
  readonly envelopeEncoding: typeof SCCP_TON_MESSAGE_BODY_BOC_V1;
  readonly submissionKind: "internal_message";
  readonly verifierEntrypoint: "op::submit_sccp_message_proof";
  readonly messageBodyBoc: Uint8Array;
  readonly messageBodyBocHex: string;
  readonly arguments: ReadonlyArray<
    Readonly<{ key: "message_body_boc"; encoding: "ton_boc"; bytes: string }>
  >;
  readonly envelopeBytes: Uint8Array;
  readonly envelopeHex: string;
}

export interface TonSccpProofResult {
  readonly version: 1;
  readonly backend: typeof SCCP_TON_CONTRACT_PROOF_BACKEND_V1;
  readonly proofBytes: Uint8Array;
  readonly proofBase64: string;
  readonly publicInputs: TonSccpProofRequest["publicInputs"];
  readonly bundleBytes: Uint8Array;
  readonly sourceProofBytes: Uint8Array;
  readonly proofContext: Readonly<SolanaSccpProofContext>;
  readonly statementHash: string;
  readonly destinationBindingHash: string;
  readonly sourceStateVerifierId: string;
  readonly sourceStateVerifierHash: string;
  readonly sourceAdapterDeploymentBindingHash: string;
  readonly sourceAdapterDeploymentBinding: Readonly<SccpSourceAdapterDeploymentBinding>;
  readonly requestHash: string;
  readonly envelopeHash: string;
}

export interface EthereumMainnetNativeEvmProverBundleSdkArtifactInput {
  sdk?: string;
  implementation?: string;
  proverArtifactHash?: string;
  prover_artifact_hash?: string;
  proofArtifactHash?: string;
  proof_artifact_hash?: string;
  provingKeyHash?: string;
  proving_key_hash?: string;
  implementationArtifact?: string;
  implementation_artifact?: string;
  implementationPath?: string;
  implementation_path?: string;
  implementationHash?: string;
  implementation_hash?: string;
}

export interface EthereumMainnetNativeEvmProverAuditHashesInput {
  circuit_security_audit: string;
  native_implementation_audit: string;
  reproducible_build_attestation: string;
  cross_sdk_fixture_parity: string;
  native_prover_self_test: string;
  no_wasm_no_remote_scan: string;
}

export interface EthereumMainnetNativeEvmProverAuditHashes {
  readonly circuit_security_audit: string;
  readonly native_implementation_audit: string;
  readonly reproducible_build_attestation: string;
  readonly cross_sdk_fixture_parity: string;
  readonly native_prover_self_test: string;
  readonly no_wasm_no_remote_scan: string;
}

export interface EthereumMainnetNativeEvmProverBundleInputBase {
  schema?: typeof SCCP_NATIVE_EVM_PROVER_BUNDLE_SCHEMA_V1;
  bundleId?: typeof SCCP_ETH_NATIVE_EVM_PROVER_BUNDLE_ID_V1;
  bundle_id?: typeof SCCP_ETH_NATIVE_EVM_PROVER_BUNDLE_ID_V1;
  domain?: SccpDomainIdInput;
  chain?: "eth";
  proofBackend?: typeof SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1;
  proof_backend?: typeof SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1;
  backend?: typeof SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1;
  proofArtifactHash?: string;
  proof_artifact_hash?: string;
  proverArtifactHash?: string;
  prover_artifact_hash?: string;
  circuitArtifactHash?: string;
  circuit_artifact_hash?: string;
  proofArtifact?: string;
  proof_artifact?: string;
  proverArtifact?: string;
  prover_artifact?: string;
  circuitArtifact?: string;
  circuit_artifact?: string;
  provingKeyHash?: string;
  proving_key_hash?: string;
  provingKey?: string;
  proving_key?: string;
  verifierKeyHash?: string;
  verifier_key_hash?: string;
  verifierKey?: string;
  verifier_key?: string;
  destinationBindingHash?: string;
  destination_binding_hash?: string;
  noWasm?: true;
  no_wasm?: true;
  remoteProverRequired?: false;
  remote_prover_required?: false;
  browserImplementation?: "pure-typescript";
  browser_implementation?: "pure-typescript";
  nativeSdkArtifacts?: readonly EthereumMainnetNativeEvmProverBundleSdkArtifactInput[];
  native_sdk_artifacts?: readonly EthereumMainnetNativeEvmProverBundleSdkArtifactInput[];
  sdkArtifacts?: readonly EthereumMainnetNativeEvmProverBundleSdkArtifactInput[];
  sdk_artifacts?: readonly EthereumMainnetNativeEvmProverBundleSdkArtifactInput[];
  crossSdkParityArtifact?: string;
  cross_sdk_parity_artifact?: string;
  crossSdkFixtureParityArtifact?: string;
  cross_sdk_fixture_parity_artifact?: string;
  nativeProverSelfTestArtifact?: string;
  native_prover_self_test_artifact?: string;
  selfTestArtifact?: string;
  self_test_artifact?: string;
  auditHashes?: EthereumMainnetNativeEvmProverAuditHashesInput;
  audit_hashes?: EthereumMainnetNativeEvmProverAuditHashesInput;
}

export type EthereumMainnetNativeEvmProverBundleInput =
  EthereumMainnetNativeEvmProverBundleInputBase &
    (
      | {
          verifierKeyArtifactHash: string;
          verifier_key_artifact_hash?: string;
        }
      | {
          verifierKeyArtifactHash?: string;
          verifier_key_artifact_hash: string;
        }
    );

export type NativeEvmProverBundleProfileOverride<T> = T extends unknown
  ? Omit<T, "bundleId" | "bundle_id" | "chain">
  : never;

export interface EthereumMainnetNativeEvmProverBundleSdkArtifact {
  readonly sdk: "dotnet" | "java-android" | "javascript" | "kotlin" | "swift";
  readonly implementation:
    | "native-csharp"
    | "native-java"
    | "native-kotlin"
    | "native-swift"
    | "pure-typescript";
  readonly proofArtifactHash: string;
  readonly proofArtifact: string;
  readonly provingKeyHash: string;
  readonly provingKey: string;
  readonly implementationArtifact: string;
  readonly implementationHash: string;
}

export interface EthereumMainnetNativeEvmProverBundle {
  readonly schema: typeof SCCP_NATIVE_EVM_PROVER_BUNDLE_SCHEMA_V1;
  readonly bundleId: typeof SCCP_ETH_NATIVE_EVM_PROVER_BUNDLE_ID_V1;
  readonly domain: number;
  readonly chain: "eth";
  readonly proofBackend: typeof SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1;
  readonly proofArtifactHash: string;
  readonly proofArtifact: string;
  readonly provingKeyHash: string;
  readonly provingKey: string;
  readonly verifierKeyHash: string;
  readonly verifierKeyArtifactHash: string;
  readonly verifierKey: string;
  readonly destinationBindingHash: string;
  readonly noWasm: true;
  readonly remoteProverRequired: false;
  readonly browserImplementation: "pure-typescript";
  readonly nativeSdkArtifacts: readonly Readonly<EthereumMainnetNativeEvmProverBundleSdkArtifact>[];
  readonly crossSdkParityArtifact: string;
  readonly crossSdkFixtureParityArtifact: string;
  readonly nativeProverSelfTestArtifact: string;
  readonly auditHashes: Readonly<EthereumMainnetNativeEvmProverAuditHashes>;
}

export type EthereumMainnetNativeEvmProverParitySchema =
  typeof SCCP_ETH_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1;

export interface EthereumMainnetNativeEvmProverParitySdkResult {
  readonly receiptProofHash: string;
  readonly sourceProofHash: string;
  readonly destinationBindingHash: string;
  readonly publicSignalWords: readonly string[];
  readonly calldataHash: string;
  readonly toriiSubmitPayloadHash: string;
}

export interface EthereumMainnetNativeEvmProverParityFixture {
  readonly schema: EthereumMainnetNativeEvmProverParitySchema;
  readonly domain: number;
  readonly chain: "eth";
  readonly proofBackend: typeof SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1;
  readonly proofArtifactHash: string;
  readonly provingKeyHash: string;
  readonly verifierKeyHash: string;
  readonly destinationBindingHash: string;
  readonly receiptProofHash: string;
  readonly sourceProofHash: string;
  readonly publicSignalWords: readonly string[];
  readonly calldataHash: string;
  readonly toriiSubmitPayloadHash: string;
  readonly productionAttestationHash: string;
  readonly sdkResults: Readonly<
    Record<
      "dotnet" | "java-android" | "javascript" | "kotlin" | "swift",
      Readonly<EthereumMainnetNativeEvmProverParitySdkResult>
    >
  >;
}

export interface EthereumMainnetNativeEvmProverSelfTestSdkResult {
  readonly requestHash: string;
  readonly witnessHash: string;
  readonly sourceProofHash: string;
  readonly proofHash: string;
  readonly publicSignalWords: readonly string[];
  readonly calldataHash: string;
  readonly toriiSubmitPayloadHash: string;
}

export interface EthereumMainnetNativeEvmProverSelfTestFixture {
  readonly schema: typeof SCCP_ETH_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1;
  readonly domain: number;
  readonly chain: "eth";
  readonly proofBackend: typeof SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1;
  readonly proofArtifactHash: string;
  readonly provingKeyHash: string;
  readonly verifierKeyHash: string;
  readonly destinationBindingHash: string;
  readonly requestHash: string;
  readonly witnessHash: string;
  readonly sourceProofHash: string;
  readonly proofHash: string;
  readonly publicSignalWords: readonly string[];
  readonly calldataHash: string;
  readonly toriiSubmitPayloadHash: string;
  readonly productionAttestationHash: string;
  readonly sdkResults: Readonly<
    Record<
      "dotnet" | "java-android" | "javascript" | "kotlin" | "swift",
      Readonly<EthereumMainnetNativeEvmProverSelfTestSdkResult>
    >
  >;
}

export interface EthereumMainnetNativeEvmProverArtifacts {
  readonly hashAlgorithm: typeof SCCP_NATIVE_EVM_PROVER_ARTIFACT_HASH_ALGORITHM_V1;
  readonly nativeProverBundle: Readonly<EthereumMainnetNativeEvmProverBundle>;
  readonly proofArtifactHash: string;
  readonly provingKeyHash: string;
  readonly verifierKeyHash: string;
  readonly verifierKeyArtifactHash: string;
  readonly crossSdkParityHash: string;
  readonly crossSdkParity: Readonly<EthereumMainnetNativeEvmProverParityFixture>;
  readonly crossSdkFixtureParityHash: string;
  readonly crossSdkFixtureParity: Readonly<EthereumMainnetNativeEvmProverParityFixture>;
  readonly nativeProverSelfTestHash: string;
  readonly nativeProverSelfTest: Readonly<EthereumMainnetNativeEvmProverSelfTestFixture>;
  readonly sdk: "dotnet" | "java-android" | "javascript" | "kotlin" | "swift";
  readonly implementation:
    | "native-csharp"
    | "native-java"
    | "native-kotlin"
    | "native-swift"
    | "pure-typescript";
  readonly implementationHash: string;
}

export interface BscGroth16ProofSelfTestReport {
  readonly schema: typeof SCCP_BSC_GROTH16_PROOF_SELF_TEST_SCHEMA_V1;
  readonly routeId: typeof SCCP_TAIRA_BSC_XOR_ROUTE_ID_V1;
  readonly assetKey: typeof SCCP_TAIRA_XOR_ASSET_KEY_V1;
  readonly bscNetwork: "mainnet" | "testnet";
  readonly chain: "bsc-mainnet" | "bsc-testnet";
  readonly chainIdHex: string;
  readonly networkIdHex: string;
  readonly circuitProfile: "sccp-bsc-full-message-v1";
  readonly proofBackend: typeof SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1;
  readonly proofFamily: typeof SCCP_STARK_FRI_PROOF_FAMILY_V1;
  readonly materialManifestHash: string;
  readonly circuitSourceHash: string;
  readonly proofArtifactHash: string;
  readonly provingKeyHash: string;
  readonly bscVerifierKeyArtifactHash: string;
  readonly snarkjsVerificationKeyHash: string;
  readonly witnessWasmHash: string;
  readonly witnessHash: string;
  readonly proofHash: string;
  readonly publicSignalsHash: string;
  readonly publicSignals: readonly string[];
}

export interface EthereumMainnetNativeEvmProverArtifactResolverMetadata {
  readonly path: string;
  readonly label:
    | "crossSdkParityBytes"
    | "crossSdkFixtureParityBytes"
    | "implementationBytes"
    | "nativeProverSelfTestBytes"
    | "proofArtifactBytes"
    | "provingKeyBytes"
    | "verifierKeyBytes";
  readonly role:
    | "crossSdkParityArtifact"
    | "crossSdkFixtureParityArtifact"
    | "implementationArtifact"
    | "nativeProverSelfTestArtifact"
    | "proofArtifact"
    | "provingKey"
    | "verifierKey";
  readonly sdk: "dotnet" | "java-android" | "javascript" | "kotlin" | "swift";
  readonly implementation:
    | "native-csharp"
    | "native-java"
    | "native-kotlin"
    | "native-swift"
    | "pure-typescript";
  readonly nativeProverBundle: Readonly<EthereumMainnetNativeEvmProverBundle>;
}

export interface BscNativeEvmProverArtifactResolverMetadata
  extends Omit<
    EthereumMainnetNativeEvmProverArtifactResolverMetadata,
    "label" | "nativeProverBundle" | "role"
  > {
  readonly label:
    | EthereumMainnetNativeEvmProverArtifactResolverMetadata["label"]
    | "groth16ProofSelfTestBytes";
  readonly role:
    | EthereumMainnetNativeEvmProverArtifactResolverMetadata["role"]
    | "groth16ProofSelfTestArtifact";
}

export interface EthereumMainnetNativeEvmProverArtifactBundleInput {
  nativeProverBundle?: EthereumMainnetNativeEvmProverBundleInput | string;
  native_prover_bundle?: EthereumMainnetNativeEvmProverBundleInput | string;
  proverBundle?: EthereumMainnetNativeEvmProverBundleInput | string;
  prover_bundle?: EthereumMainnetNativeEvmProverBundleInput | string;
  manifest?: EthereumMainnetNativeEvmProverBundleInput | string;
  sdk: "dotnet" | "java-android" | "javascript" | "kotlin" | "swift";
  artifactResolver?: (
    path: string,
    metadata: EthereumMainnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
  artifact_resolver?: (
    path: string,
    metadata: EthereumMainnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
  resolveArtifact?: (
    path: string,
    metadata: EthereumMainnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
  resolve_artifact?: (
    path: string,
    metadata: EthereumMainnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
  resolveArtifactBytes?: (
    path: string,
    metadata: EthereumMainnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
  resolve_artifact_bytes?: (
    path: string,
    metadata: EthereumMainnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
}

export interface BscTestnetNativeEvmProverAuditHashesInput {
  circuit_security_audit: string;
  native_implementation_audit: string;
  reproducible_build_attestation: string;
  cross_sdk_parity: string;
  native_prover_self_test: string;
  no_wasm_no_remote_scan: string;
}

export interface BscTestnetNativeEvmProverAuditHashes {
  readonly circuit_security_audit: string;
  readonly native_implementation_audit: string;
  readonly reproducible_build_attestation: string;
  readonly cross_sdk_parity: string;
  readonly native_prover_self_test: string;
  readonly no_wasm_no_remote_scan: string;
}

export type BscTestnetNativeEvmProverBundleInput = Omit<
  NativeEvmProverBundleProfileOverride<EthereumMainnetNativeEvmProverBundleInput>,
  | "auditHashes"
  | "audit_hashes"
  | "crossSdkFixtureParityArtifact"
  | "cross_sdk_fixture_parity_artifact"
> & {
  bundleId?: typeof SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1;
  bundle_id?: typeof SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1;
  chain?: "bsc-testnet";
  groth16ProofSelfTestArtifact?: string;
  groth16_proof_self_test_artifact?: string;
  groth16ProofSelfTestHash?: string;
  groth16_proof_self_test_hash?: string;
  auditHashes?: BscTestnetNativeEvmProverAuditHashesInput;
  audit_hashes?: BscTestnetNativeEvmProverAuditHashesInput;
};

export interface BscTestnetNativeEvmProverBundle
  extends Omit<
    EthereumMainnetNativeEvmProverBundle,
    "bundleId" | "chain" | "auditHashes" | "crossSdkFixtureParityArtifact"
  > {
  readonly bundleId: typeof SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1;
  readonly chain: "bsc-testnet";
  readonly groth16ProofSelfTestArtifact: string;
  readonly groth16ProofSelfTestHash: string;
  readonly auditHashes: Readonly<BscTestnetNativeEvmProverAuditHashes>;
}

export function validateBscTestnetNativeEvmProverBundle(
  manifest: BscTestnetNativeEvmProverBundleInput,
  options?: {
    expectedDestinationBindingHash?: string;
    expected_destination_binding_hash?: string;
    destinationBindingHash?: string;
    destination_binding_hash?: string;
    destinationBinding?: EvmSccpDestinationBindingInput;
    destination_binding?: EvmSccpDestinationBindingInput;
  },
): BscTestnetNativeEvmProverBundle;

export type BscTestnetNativeEvmProverParitySchema =
  typeof SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1;

export interface BscTestnetNativeEvmProverParityFixture
  extends Omit<
    EthereumMainnetNativeEvmProverParityFixture,
    "schema" | "chain"
  > {
  readonly schema: BscTestnetNativeEvmProverParitySchema;
  readonly chain: "bsc-testnet";
}

export interface BscTestnetNativeEvmProverSelfTestFixture
  extends Omit<
    EthereumMainnetNativeEvmProverSelfTestFixture,
    "schema" | "chain"
  > {
  readonly schema: typeof SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1;
  readonly chain: "bsc-testnet";
}

export interface BscTestnetNativeEvmProverArtifacts
  extends Omit<
    EthereumMainnetNativeEvmProverArtifacts,
    | "nativeProverBundle"
    | "crossSdkParity"
    | "crossSdkFixtureParityHash"
    | "crossSdkFixtureParity"
    | "nativeProverSelfTest"
  > {
  readonly nativeProverBundle: Readonly<BscTestnetNativeEvmProverBundle>;
  readonly crossSdkParity: Readonly<BscTestnetNativeEvmProverParityFixture>;
  readonly nativeProverSelfTest: Readonly<BscTestnetNativeEvmProverSelfTestFixture>;
  readonly groth16ProofSelfTestHash: string;
  readonly groth16ProofSelfTest: Readonly<BscGroth16ProofSelfTestReport>;
}

export interface BscTestnetNativeEvmProverArtifactResolverMetadata
  extends Omit<
    BscNativeEvmProverArtifactResolverMetadata,
    "nativeProverBundle"
  > {
  readonly nativeProverBundle: Readonly<BscTestnetNativeEvmProverBundle>;
}

export interface BscTestnetNativeEvmProverArtifactBundleInput
  extends Omit<
    EthereumMainnetNativeEvmProverArtifactBundleInput,
    | "nativeProverBundle"
    | "native_prover_bundle"
    | "proverBundle"
    | "prover_bundle"
    | "manifest"
    | "artifactResolver"
    | "artifact_resolver"
    | "resolveArtifact"
    | "resolve_artifact"
    | "resolveArtifactBytes"
    | "resolve_artifact_bytes"
  > {
  nativeProverBundle?: BscTestnetNativeEvmProverBundleInput | string;
  native_prover_bundle?: BscTestnetNativeEvmProverBundleInput | string;
  proverBundle?: BscTestnetNativeEvmProverBundleInput | string;
  prover_bundle?: BscTestnetNativeEvmProverBundleInput | string;
  manifest?: BscTestnetNativeEvmProverBundleInput | string;
  artifactResolver?: (
    path: string,
    metadata: BscTestnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
  artifact_resolver?: (
    path: string,
    metadata: BscTestnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
  resolveArtifact?: (
    path: string,
    metadata: BscTestnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
  resolve_artifact?: (
    path: string,
    metadata: BscTestnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
  resolveArtifactBytes?: (
    path: string,
    metadata: BscTestnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
  resolve_artifact_bytes?: (
    path: string,
    metadata: BscTestnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
}

export function verifyBscTestnetNativeEvmProverArtifactsFromBundle(
  input: BscTestnetNativeEvmProverArtifactBundleInput,
  options?: {
    expectedDestinationBindingHash?: string;
    expected_destination_binding_hash?: string;
    destinationBindingHash?: string;
    destination_binding_hash?: string;
    destinationBinding?: EvmSccpDestinationBindingInput;
    destination_binding?: EvmSccpDestinationBindingInput;
  },
): Promise<BscTestnetNativeEvmProverArtifacts>;

export interface BscMainnetNativeEvmProverAuditHashesInput {
  circuit_security_audit: string;
  native_implementation_audit: string;
  reproducible_build_attestation: string;
  cross_sdk_parity: string;
  native_prover_self_test: string;
  no_wasm_no_remote_scan: string;
}

export interface BscMainnetNativeEvmProverAuditHashes {
  readonly circuit_security_audit: string;
  readonly native_implementation_audit: string;
  readonly reproducible_build_attestation: string;
  readonly cross_sdk_parity: string;
  readonly native_prover_self_test: string;
  readonly no_wasm_no_remote_scan: string;
}

export type BscMainnetNativeEvmProverBundleInput = Omit<
  NativeEvmProverBundleProfileOverride<EthereumMainnetNativeEvmProverBundleInput>,
  | "auditHashes"
  | "audit_hashes"
  | "crossSdkFixtureParityArtifact"
  | "cross_sdk_fixture_parity_artifact"
> & {
  bundleId?: typeof SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1;
  bundle_id?: typeof SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1;
  chain?: "bsc-mainnet";
  groth16ProofSelfTestArtifact?: string;
  groth16_proof_self_test_artifact?: string;
  groth16ProofSelfTestHash?: string;
  groth16_proof_self_test_hash?: string;
  auditHashes?: BscMainnetNativeEvmProverAuditHashesInput;
  audit_hashes?: BscMainnetNativeEvmProverAuditHashesInput;
};

export interface BscMainnetNativeEvmProverBundle
  extends Omit<
    EthereumMainnetNativeEvmProverBundle,
    "bundleId" | "chain" | "auditHashes" | "crossSdkFixtureParityArtifact"
  > {
  readonly bundleId: typeof SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1;
  readonly chain: "bsc-mainnet";
  readonly groth16ProofSelfTestArtifact: string;
  readonly groth16ProofSelfTestHash: string;
  readonly auditHashes: Readonly<BscMainnetNativeEvmProverAuditHashes>;
}

export type BscMainnetNativeEvmProverParitySchema =
  typeof SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1;

export interface BscMainnetNativeEvmProverParityFixture
  extends Omit<
    EthereumMainnetNativeEvmProverParityFixture,
    "schema" | "chain"
  > {
  readonly schema: BscMainnetNativeEvmProverParitySchema;
  readonly chain: "bsc-mainnet";
}

export interface BscMainnetNativeEvmProverSelfTestFixture
  extends Omit<
    EthereumMainnetNativeEvmProverSelfTestFixture,
    "schema" | "chain"
  > {
  readonly schema: typeof SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1;
  readonly chain: "bsc-mainnet";
}

export interface BscMainnetNativeEvmProverArtifacts
  extends Omit<
    EthereumMainnetNativeEvmProverArtifacts,
    | "nativeProverBundle"
    | "crossSdkParity"
    | "crossSdkFixtureParityHash"
    | "crossSdkFixtureParity"
    | "nativeProverSelfTest"
  > {
  readonly nativeProverBundle: Readonly<BscMainnetNativeEvmProverBundle>;
  readonly crossSdkParity: Readonly<BscMainnetNativeEvmProverParityFixture>;
  readonly nativeProverSelfTest: Readonly<BscMainnetNativeEvmProverSelfTestFixture>;
  readonly groth16ProofSelfTestHash: string;
  readonly groth16ProofSelfTest: Readonly<BscGroth16ProofSelfTestReport>;
}

export interface BscMainnetNativeEvmProverArtifactResolverMetadata
  extends Omit<
    BscNativeEvmProverArtifactResolverMetadata,
    "nativeProverBundle"
  > {
  readonly nativeProverBundle: Readonly<BscMainnetNativeEvmProverBundle>;
}

export interface BscMainnetNativeEvmProverArtifactBundleInput
  extends Omit<
    EthereumMainnetNativeEvmProverArtifactBundleInput,
    | "nativeProverBundle"
    | "native_prover_bundle"
    | "proverBundle"
    | "prover_bundle"
    | "manifest"
    | "artifactResolver"
    | "artifact_resolver"
    | "resolveArtifact"
    | "resolve_artifact"
    | "resolveArtifactBytes"
    | "resolve_artifact_bytes"
  > {
  nativeProverBundle?: BscMainnetNativeEvmProverBundleInput | string;
  native_prover_bundle?: BscMainnetNativeEvmProverBundleInput | string;
  proverBundle?: BscMainnetNativeEvmProverBundleInput | string;
  prover_bundle?: BscMainnetNativeEvmProverBundleInput | string;
  manifest?: BscMainnetNativeEvmProverBundleInput | string;
  artifactResolver?: (
    path: string,
    metadata: BscMainnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
  artifact_resolver?: (
    path: string,
    metadata: BscMainnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
  resolveArtifact?: (
    path: string,
    metadata: BscMainnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
  resolve_artifact?: (
    path: string,
    metadata: BscMainnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
  resolveArtifactBytes?: (
    path: string,
    metadata: BscMainnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
  resolve_artifact_bytes?: (
    path: string,
    metadata: BscMainnetNativeEvmProverArtifactResolverMetadata,
  ) => BinaryLike | Promise<BinaryLike>;
}

export function validateBscMainnetNativeEvmProverBundle(
  manifest: BscMainnetNativeEvmProverBundleInput,
  options?: {
    expectedDestinationBindingHash?: string;
    expected_destination_binding_hash?: string;
    destinationBindingHash?: string;
    destination_binding_hash?: string;
    destinationBinding?: EvmSccpDestinationBindingInput;
    destination_binding?: EvmSccpDestinationBindingInput;
  },
): BscMainnetNativeEvmProverBundle;

export function verifyBscMainnetNativeEvmProverArtifactsFromBundle(
  input: BscMainnetNativeEvmProverArtifactBundleInput,
  options?: {
    expectedDestinationBindingHash?: string;
    expected_destination_binding_hash?: string;
    destinationBindingHash?: string;
    destination_binding_hash?: string;
    destinationBinding?: EvmSccpDestinationBindingInput;
    destination_binding?: EvmSccpDestinationBindingInput;
  },
): Promise<BscMainnetNativeEvmProverArtifacts>;

export interface EvmSccpProofRequestInput {
  publicInputs?: SccpMessageTransparentPublicInputsInput;
  public_inputs?: SccpMessageTransparentPublicInputsInput;
  bundleBytes?: BinaryLike;
  bundle_bytes?: BinaryLike;
  sourceProofBytes?: BinaryLike;
  source_proof_bytes?: BinaryLike;
  backend?: typeof SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1;
  sourceDomain?: SccpDomainIdInput;
  source_domain?: SccpDomainIdInput;
  statementHash?: string;
  statement_hash?: string;
  destinationBindingHash?: string;
  destination_binding_hash?: string;
  destinationBinding?: EvmSccpDestinationBindingInput;
  destination_binding?: EvmSccpDestinationBindingInput;
  proofArtifactHash?: string;
  proof_artifact_hash?: string;
  proverArtifactHash?: string;
  prover_artifact_hash?: string;
  circuitArtifactHash?: string;
  circuit_artifact_hash?: string;
  provingKeyHash?: string;
  proving_key_hash?: string;
  nativeProverBundle?: EthereumMainnetNativeEvmProverBundleInput | string;
  native_prover_bundle?: EthereumMainnetNativeEvmProverBundleInput | string;
  proverBundle?: EthereumMainnetNativeEvmProverBundleInput | string;
  prover_bundle?: EthereumMainnetNativeEvmProverBundleInput | string;
  manifest?: EthereumMainnetNativeEvmProverBundleInput | string;
  nativeProverArtifacts?: EthereumMainnetNativeEvmProverArtifacts;
  native_prover_artifacts?: EthereumMainnetNativeEvmProverArtifacts;
  verifiedNativeProverArtifacts?: EthereumMainnetNativeEvmProverArtifacts;
  verified_native_prover_artifacts?: EthereumMainnetNativeEvmProverArtifacts;
  proofArtifactBytes?: BinaryLike;
  proof_artifact_bytes?: BinaryLike;
  proverArtifactBytes?: BinaryLike;
  prover_artifact_bytes?: BinaryLike;
  circuitArtifactBytes?: BinaryLike;
  circuit_artifact_bytes?: BinaryLike;
  provingKeyBytes?: BinaryLike;
  proving_key_bytes?: BinaryLike;
  verifierKeyBytes?: BinaryLike;
  verifier_key_bytes?: BinaryLike;
  sdk?: "dotnet" | "java-android" | "javascript" | "kotlin" | "swift";
  implementationBytes?: BinaryLike;
  implementation_bytes?: BinaryLike;
  nativeImplementationBytes?: BinaryLike;
  native_implementation_bytes?: BinaryLike;
  proofContext?: SolanaSccpProofContextInput;
  proof_context?: SolanaSccpProofContextInput;
}

export interface EvmSccpProofRequest {
  readonly version: 1;
  readonly backend: typeof SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1;
  readonly sourceDomain: number;
  readonly targetDomain: number;
  readonly publicInputs: Readonly<
    Required<{
      version: number;
      messageId: string;
      payloadHash: string;
      targetDomain: number;
      commitmentRoot: string;
      finalityHeight: string;
      finalityBlockHash: string;
    }>
  >;
  readonly publicInputsBytes: Uint8Array;
  readonly publicSignalWords: readonly string[];
  readonly bundleBytes: Uint8Array;
  readonly sourceProofBytes: Uint8Array;
  readonly proofContext: Readonly<SolanaSccpProofContext>;
  readonly statementHash: string;
  readonly destinationBinding?: Readonly<EvmSccpDestinationBinding>;
  readonly destinationBindingHash: string;
  readonly requestHash: string;
  readonly proofArtifactHash?: string;
  readonly provingKeyHash?: string;
}

export interface EvmSccpProofResult {
  readonly version: 1;
  readonly backend: typeof SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1;
  readonly proofBytes: Uint8Array;
  readonly proofBase64: string;
  readonly publicInputs: EvmSccpProofRequest["publicInputs"];
  readonly publicSignalWords: readonly string[];
  readonly bundleBytes: Uint8Array;
  readonly sourceProofBytes: Uint8Array;
  readonly proofContext: Readonly<SolanaSccpProofContext>;
  readonly statementHash: string;
  readonly destinationBinding: Readonly<EvmSccpDestinationBinding>;
  readonly destinationBindingHash: string;
  readonly requestHash: string;
  readonly envelopeHash: string;
  readonly proofArtifactHash?: string;
  readonly provingKeyHash?: string;
}

export interface EvmSccpSubmissionInput {
  proofResult?: EvmSccpProofResult;
  proof_result?: EvmSccpProofResult;
  proofBytes?: BinaryLike;
  proof_bytes?: BinaryLike;
  /** Accepted only with proofResult; raw contract-call submissions cannot bind bundle bytes. */
  bundleBytes?: BinaryLike;
  bundle_bytes?: BinaryLike;
  /** Accepted only with proofResult; raw contract-call submissions cannot bind source proof bytes. */
  sourceProofBytes?: BinaryLike;
  source_proof_bytes?: BinaryLike;
  publicInputs?: SccpMessageTransparentPublicInputsInput;
  public_inputs?: SccpMessageTransparentPublicInputsInput;
  sourceDomain?: SccpDomainIdInput;
  source_domain?: SccpDomainIdInput;
  statementHash?: string;
  statement_hash?: string;
  destinationBindingHash?: string;
  destination_binding_hash?: string;
  publicSignalWords?: readonly string[];
  public_signal_words?: readonly string[];
  proofArtifactHash?: string;
  proof_artifact_hash?: string;
  proverArtifactHash?: string;
  prover_artifact_hash?: string;
  circuitArtifactHash?: string;
  circuit_artifact_hash?: string;
  provingKeyHash?: string;
  proving_key_hash?: string;
}

export interface EvmSccpSubmission {
  readonly version: 1;
  readonly proofFamily: typeof SCCP_STARK_FRI_PROOF_FAMILY_V1;
  readonly verifierBackend: typeof SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1;
  readonly platformPayload: "evm_groth16_contract_call";
  readonly envelopeEncoding: typeof SCCP_EVM_CONTRACT_CALL_ABI_TUPLE_V1;
  readonly submissionKind: "contract_call";
  readonly verifierEntrypoint: "submitSccpMessageProof(bytes proof_bytes, bytes32[6] public_inputs, bytes32 statement_hash)";
  readonly contractMethod: typeof SCCP_SUBMIT_MESSAGE_PROOF_ABI_V1;
  readonly functionSelector: string;
  readonly sourceDomain: number;
  readonly targetDomain: number;
  readonly publicInputs: EvmSccpProofRequest["publicInputs"];
  readonly publicInputWords: readonly string[];
  readonly publicSignalWords: readonly string[];
  readonly proofBytes: Uint8Array;
  readonly publicInputWordsBytes: Uint8Array;
  readonly statementHash: string;
  readonly destinationBindingHash: string;
  readonly arguments: ReadonlyArray<
    Readonly<{
      key: "proof_bytes" | "public_inputs" | "statement_hash";
      encoding: "raw_bytes" | "abi_bytes32x6" | "abi_bytes32";
      bytes: string;
    }>
  >;
  readonly callData: Uint8Array;
  readonly callDataHex: string;
  readonly envelopeBytes: Uint8Array;
  readonly envelopeHex: string;
}

export interface TronSccpProofRequestInput {
  publicInputs?: SccpMessageTransparentPublicInputsInput;
  public_inputs?: SccpMessageTransparentPublicInputsInput;
  bundleBytes?: BinaryLike;
  bundle_bytes?: BinaryLike;
  sourceProofBytes?: BinaryLike;
  source_proof_bytes?: BinaryLike;
  backend?: typeof SCCP_TRON_GROTH16_BN254_PROOF_BACKEND_V1;
  sourceDomain?: SccpDomainIdInput;
  source_domain?: SccpDomainIdInput;
  statementHash?: string;
  statement_hash?: string;
  destinationBindingHash?: string;
  destination_binding_hash?: string;
  destinationBinding?: TronSccpDestinationBindingInput;
  destination_binding?: TronSccpDestinationBindingInput;
  proofContext?: SolanaSccpProofContextInput;
  proof_context?: SolanaSccpProofContextInput;
}

export interface TronSccpProofRequest {
  readonly version: 1;
  readonly backend: typeof SCCP_TRON_GROTH16_BN254_PROOF_BACKEND_V1;
  readonly sourceDomain: number;
  readonly targetDomain: number;
  readonly publicInputs: Readonly<
    Required<{
      version: number;
      messageId: string;
      payloadHash: string;
      targetDomain: number;
      commitmentRoot: string;
      finalityHeight: string;
      finalityBlockHash: string;
    }>
  >;
  readonly publicInputsBytes: Uint8Array;
  readonly publicSignalWords: readonly string[];
  readonly bundleBytes: Uint8Array;
  readonly sourceProofBytes: Uint8Array;
  readonly proofContext: Readonly<SolanaSccpProofContext>;
  readonly statementHash: string;
  readonly destinationBinding?: Readonly<TronSccpDestinationBinding>;
  readonly destinationBindingHash: string;
  readonly requestHash: string;
}

export interface TronSccpProofResult {
  readonly version: 1;
  readonly backend: typeof SCCP_TRON_GROTH16_BN254_PROOF_BACKEND_V1;
  readonly proofBytes: Uint8Array;
  readonly proofBase64: string;
  readonly publicInputs: TronSccpProofRequest["publicInputs"];
  readonly publicSignalWords: readonly string[];
  readonly bundleBytes: Uint8Array;
  readonly sourceProofBytes: Uint8Array;
  readonly proofContext: Readonly<SolanaSccpProofContext>;
  readonly statementHash: string;
  readonly destinationBinding: Readonly<TronSccpDestinationBinding>;
  readonly destinationBindingHash: string;
  readonly requestHash: string;
  readonly envelopeHash: string;
}

export interface TronSccpSubmissionInput {
  proofResult?: TronSccpProofResult;
  proof_result?: TronSccpProofResult;
  proofBytes?: BinaryLike;
  proof_bytes?: BinaryLike;
  /** Accepted only with proofResult; raw contract-call submissions cannot bind bundle bytes. */
  bundleBytes?: BinaryLike;
  bundle_bytes?: BinaryLike;
  /** Accepted only with proofResult; raw contract-call submissions cannot bind source proof bytes. */
  sourceProofBytes?: BinaryLike;
  source_proof_bytes?: BinaryLike;
  publicInputs?: SccpMessageTransparentPublicInputsInput;
  public_inputs?: SccpMessageTransparentPublicInputsInput;
  sourceDomain?: SccpDomainIdInput;
  source_domain?: SccpDomainIdInput;
  statementHash?: string;
  statement_hash?: string;
  destinationBindingHash?: string;
  destination_binding_hash?: string;
  publicSignalWords?: readonly string[];
  public_signal_words?: readonly string[];
}

export interface TronSccpSubmission {
  readonly version: 1;
  readonly proofFamily: typeof SCCP_STARK_FRI_PROOF_FAMILY_V1;
  readonly verifierBackend: typeof SCCP_TRON_GROTH16_BN254_PROOF_BACKEND_V1;
  readonly platformPayload: "tron_contract_call";
  readonly envelopeEncoding: typeof SCCP_TRON_CONTRACT_CALL_ABI_TUPLE_V1;
  readonly submissionKind: "contract_call";
  readonly verifierEntrypoint: "submitSccpMessageProof(bytes proof_bytes, bytes32[6] public_inputs, bytes32 statement_hash)";
  readonly contractMethod: typeof SCCP_SUBMIT_MESSAGE_PROOF_ABI_V1;
  readonly functionSelector: string;
  readonly sourceDomain: number;
  readonly targetDomain: typeof SCCP_DOMAIN_TRON;
  readonly publicInputs: TronSccpProofRequest["publicInputs"];
  readonly publicInputWords: readonly string[];
  readonly publicSignalWords: readonly string[];
  readonly proofBytes: Uint8Array;
  readonly publicInputWordsBytes: Uint8Array;
  readonly statementHash: string;
  readonly destinationBindingHash: string;
  readonly arguments: ReadonlyArray<
    Readonly<{
      key: "proof_bytes" | "public_inputs" | "statement_hash";
      encoding: "raw_bytes" | "abi_bytes32x6" | "abi_bytes32";
      bytes: string;
    }>
  >;
  readonly callData: Uint8Array;
  readonly callDataHex: string;
  readonly envelopeBytes: Uint8Array;
  readonly envelopeHex: string;
}

export interface SccpBridgeProofSubmitPayloadBaseInput {
  authority: string;
  privateKey?: unknown;
  private_key?: unknown;
  publicKeyHex?: string;
  public_key_hex?: string;
  signatureB64?: string;
  signature_b64?: string;
  messageBundle?: Record<string, unknown>;
  message_bundle?: Record<string, unknown>;
  creationTimeMs?: NumericLike;
  creation_time_ms?: NumericLike;
}

export interface EvmSccpBridgeProofSubmitPayloadInput
  extends SccpBridgeProofSubmitPayloadBaseInput {
  submission?: EvmSccpSubmission;
  evmSccpSubmission?: EvmSccpSubmission;
  evm_sccp_submission?: EvmSccpSubmission;
  sccpSubmission?: EvmSccpSubmission;
  sccp_submission?: EvmSccpSubmission;
  destinationBinding?: EvmSccpDestinationBindingInput;
  destination_binding?: EvmSccpDestinationBindingInput;
}

export interface TronSccpBridgeProofSubmitPayloadInput
  extends SccpBridgeProofSubmitPayloadBaseInput {
  submission?: TronSccpSubmission;
  tronSccpSubmission?: TronSccpSubmission;
  tron_sccp_submission?: TronSccpSubmission;
  sccpSubmission?: TronSccpSubmission;
  sccp_submission?: TronSccpSubmission;
  destinationBinding?: TronSccpDestinationBindingInput;
  destination_binding?: TronSccpDestinationBindingInput;
}

export type SccpWitnessProviderFn<Input> = (
  input: Input,
  options?: Record<string, unknown>,
) => Input | Promise<Input>;

export type SccpWitnessProviderResolverOption<Input> =
  | {
      resolveWitness: SccpWitnessProviderFn<Input>;
      resolve_witness?: never;
    }
  | {
      resolveWitness?: never;
      resolve_witness: SccpWitnessProviderFn<Input>;
    };

export type SccpProverWitnessProviderOption<Provider, Input> =
  | {
      witnessProvider?: Provider | SccpWitnessProviderFn<Input>;
      witness_provider?: never;
    }
  | {
      witnessProvider?: never;
      witness_provider?: Provider | SccpWitnessProviderFn<Input>;
    };

export type SccpProverProveOption<ProveFn> =
  | {
      prove?: ProveFn;
      proveFn?: never;
      prove_fn?: never;
    }
  | {
      prove?: never;
      proveFn?: ProveFn;
      prove_fn?: never;
    }
  | {
      prove?: never;
      proveFn?: never;
      prove_fn?: ProveFn;
    };

export type TonSccpWitnessProvider =
  SccpWitnessProviderResolverOption<TonSccpProofRequestInput>;

export interface TonSccpProveResult {
  proofBytes?: BinaryLike;
  proof_bytes?: BinaryLike;
  proof?: BinaryLike;
  proofBase64?: string;
  proof_base64?: string;
  backend?: typeof SCCP_TON_CONTRACT_PROOF_BACKEND_V1;
  requestHash?: string;
  request_hash?: string;
  sourceAdapterDeploymentBindingHash?: string;
  source_adapter_deployment_binding_hash?: string;
  envelopeHash?: string;
  envelope_hash?: string;
}

export type TonSccpProveFn = (
  request: TonSccpProofRequest,
  options?: Record<string, unknown>,
) => TonSccpProveResult | Promise<TonSccpProveResult>;

export type TonSccpProverOptions = SccpProverWitnessProviderOption<
  TonSccpWitnessProvider,
  TonSccpProofRequestInput
> &
  SccpProverProveOption<TonSccpProveFn>;

export class TonSccpProver {
  constructor(options?: TonSccpProverOptions);
  buildRequest(
    input: TonSccpProofRequestInput,
    options?: Record<string, unknown>,
  ): Promise<TonSccpProofRequest>;
  prove(
    input: TonSccpProofRequestInput,
    options?: Record<string, unknown>,
  ): Promise<TonSccpProofResult>;
}

export type EvmSccpWitnessProvider =
  SccpWitnessProviderResolverOption<EvmSccpProofRequestInput>;

export interface EvmSccpProveResult {
  proofBytes?: BinaryLike;
  proof_bytes?: BinaryLike;
  proof?: BinaryLike;
  proofBase64?: string;
  proof_base64?: string;
  backend?: typeof SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1;
  requestHash?: string;
  request_hash?: string;
  envelopeHash?: string;
  envelope_hash?: string;
  publicInputs?: SccpMessageTransparentPublicInputsInput;
  public_inputs?: SccpMessageTransparentPublicInputsInput;
  proofContext?: SolanaSccpProofContextInput;
  proof_context?: SolanaSccpProofContextInput;
  statementHash?: string;
  statement_hash?: string;
  destinationBindingHash?: string;
  destination_binding_hash?: string;
  proofArtifactHash?: string;
  proof_artifact_hash?: string;
  proverArtifactHash?: string;
  prover_artifact_hash?: string;
  circuitArtifactHash?: string;
  circuit_artifact_hash?: string;
  provingKeyHash?: string;
  proving_key_hash?: string;
  publicSignalWords?: readonly string[];
  public_signal_words?: readonly string[];
}

export type EvmSccpProveFn = (
  request: EvmSccpProofRequest,
  options?: Record<string, unknown>,
) => EvmSccpProveResult | Promise<EvmSccpProveResult>;

export type EvmSccpProverOptions = SccpProverWitnessProviderOption<
  EvmSccpWitnessProvider,
  EvmSccpProofRequestInput
> &
  SccpProverProveOption<EvmSccpProveFn>;

export type BscMainnetSccpProofRequestInput = EvmSccpProofRequestInput;

export type BscMainnetSccpProofRequest = EvmSccpProofRequest;

export type BscMainnetSccpProofResult = EvmSccpProofResult;

export type BscMainnetSccpSubmissionInput = EvmSccpSubmissionInput &
  ({ proofResult: EvmSccpProofResult } | { proof_result: EvmSccpProofResult });

export type BscMainnetSccpSubmission = EvmSccpSubmission;

export type BscMainnetSccpProverOptions = EvmSccpProverOptions;

export type BscTestnetSccpProofRequestInput = EvmSccpProofRequestInput;

export type BscTestnetSccpProofRequest = EvmSccpProofRequest;

export type BscTestnetSccpProofResult = EvmSccpProofResult;

export type BscTestnetSccpSubmissionInput = EvmSccpSubmissionInput &
  ({ proofResult: EvmSccpProofResult } | { proof_result: EvmSccpProofResult });

export type BscTestnetSccpSubmission = EvmSccpSubmission;

export type BscTestnetSccpProverOptions = EvmSccpProverOptions;

export class BscMainnetSccpProver {
  constructor(options?: BscMainnetSccpProverOptions);
  buildRequest(
    input: BscMainnetSccpProofRequestInput,
    options?: Record<string, unknown>,
  ): Promise<BscMainnetSccpProofRequest>;
  prove(
    input: BscMainnetSccpProofRequestInput,
    options?: Record<string, unknown>,
  ): Promise<BscMainnetSccpProofResult>;
}

export class BscTestnetSccpProver {
  constructor(options?: BscTestnetSccpProverOptions);
  buildRequest(
    input: BscTestnetSccpProofRequestInput,
    options?: Record<string, unknown>,
  ): Promise<BscTestnetSccpProofRequest>;
  prove(
    input: BscTestnetSccpProofRequestInput,
    options?: Record<string, unknown>,
  ): Promise<BscTestnetSccpProofResult>;
}

export type TronSccpWitnessProvider =
  SccpWitnessProviderResolverOption<TronSccpProofRequestInput>;

export interface TronSccpProveResult {
  proofBytes?: BinaryLike;
  proof_bytes?: BinaryLike;
  proof?: BinaryLike;
  proofBase64?: string;
  proof_base64?: string;
  backend?: typeof SCCP_TRON_GROTH16_BN254_PROOF_BACKEND_V1;
  requestHash?: string;
  request_hash?: string;
  envelopeHash?: string;
  envelope_hash?: string;
  publicInputs?: SccpMessageTransparentPublicInputsInput;
  public_inputs?: SccpMessageTransparentPublicInputsInput;
  proofContext?: SolanaSccpProofContextInput;
  proof_context?: SolanaSccpProofContextInput;
  statementHash?: string;
  statement_hash?: string;
  destinationBindingHash?: string;
  destination_binding_hash?: string;
  publicSignalWords?: readonly string[];
  public_signal_words?: readonly string[];
}

export type TronSccpProveFn = (
  request: TronSccpProofRequest,
  options?: Record<string, unknown>,
) => TronSccpProveResult | Promise<TronSccpProveResult>;

export type TronSccpProverOptions = SccpProverWitnessProviderOption<
  TronSccpWitnessProvider,
  TronSccpProofRequestInput
> &
  SccpProverProveOption<TronSccpProveFn>;

export class TronSccpProver {
  constructor(options?: TronSccpProverOptions);
  buildRequest(
    input: TronSccpProofRequestInput,
    options?: Record<string, unknown>,
  ): Promise<TronSccpProofRequest>;
  prove(
    input: TronSccpProofRequestInput,
    options?: Record<string, unknown>,
  ): Promise<TronSccpProofResult>;
}

export function canonicalSccpMessageTransparentPublicInputsBytes(
  input: SccpMessageTransparentPublicInputsInput,
): Uint8Array;

export function sccpSubmitMessageProofCallData(
  proofBytes: BinaryLike,
  publicInputs: SccpMessageTransparentPublicInputsInput,
  statementHash: string,
  sourceDomain?: number,
): Uint8Array;

export function buildSccpTonMessageBodyBocFromBytes(
  input: TonSccpMessageBodyBytesInput,
): Uint8Array;

export function buildSccpTonChunkedMessageBodyBocsFromBytes(
  input: TonSccpChunkedMessageBodyInput,
): TonSccpChunkedMessageBodyPlan;

export function buildTonSccpProofRequest(
  input: TonSccpProofRequestInput,
): TonSccpProofRequest;

export function wrapTonSccpProofResult(
  proofBytes: BinaryLike,
  request: TonSccpProofRequest,
): TonSccpProofResult;

export function buildTonSccpSubmission(
  input: TonSccpMessageBodyInput,
): TonSccpSubmission;

export function buildEvmSccpBridgeProofSubmitPayload(
  input: EvmSccpBridgeProofSubmitPayloadInput,
): ToriiBridgeProofSubmitPayload;

export function buildBscMainnetSccpDestinationProofRequest(
  input: BscMainnetSccpProofRequestInput,
): BscMainnetSccpProofRequest;

export function wrapBscMainnetSccpDestinationProofResult(
  proofBytes: BinaryLike,
  request: BscMainnetSccpProofRequest,
): BscMainnetSccpProofResult;

export function buildBscMainnetSccpDestinationSubmission(
  input: BscMainnetSccpSubmissionInput,
): BscMainnetSccpSubmission;

export function buildBscTestnetSccpDestinationProofRequest(
  input: BscTestnetSccpProofRequestInput,
): BscTestnetSccpProofRequest;

export function wrapBscTestnetSccpDestinationProofResult(
  proofBytes: BinaryLike,
  request: BscTestnetSccpProofRequest,
): BscTestnetSccpProofResult;

export function buildBscTestnetSccpDestinationSubmission(
  input: BscTestnetSccpSubmissionInput,
): BscTestnetSccpSubmission;

export function buildTronSccpProofRequest(
  input: TronSccpProofRequestInput,
): TronSccpProofRequest;

export function wrapTronSccpProofResult(
  proofBytes: BinaryLike,
  request: TronSccpProofRequest,
): TronSccpProofResult;

export function buildTronSccpSubmission(
  input: TronSccpSubmissionInput,
): TronSccpSubmission;

export function buildTronSccpBridgeProofSubmitPayload(
  input: TronSccpBridgeProofSubmitPayloadInput,
): ToriiBridgeProofSubmitPayload;

export function buildBscSourceChainProofEnvelope(
  input: BscSourceChainProofEnvelopeInput,
): BscSourceChainProofEnvelopeResult;

export interface TronTriggerSmartContractRawDataParseOptions {
  readonly expectedOwnerAddress?:
    | string
    | Uint8Array
    | ArrayBuffer
    | ArrayBufferView
    | number[];
  readonly expectedContractAddress?:
    | string
    | Uint8Array
    | ArrayBuffer
    | ArrayBufferView
    | number[];
  readonly expectedCallData?:
    | string
    | Uint8Array
    | ArrayBuffer
    | ArrayBufferView
    | number[];
}

export interface TronTriggerSmartContractRawDataView {
  readonly rawDataHash: string;
  readonly ownerAddress: string;
  readonly ownerAddress20: string;
  readonly contractAddress: string;
  readonly contractAddress20: string;
  readonly callData: string;
  readonly refBlockNum: string | null;
  readonly timestampMs: string;
  readonly expirationMs: string;
  readonly feeLimit: string;
}

export function parseTronTriggerSmartContractRawData(
  rawData: string | Uint8Array | ArrayBuffer | ArrayBufferView | number[],
  options?: TronTriggerSmartContractRawDataParseOptions,
): TronTriggerSmartContractRawDataView;

export function sccpDestinationBindingHash(
  input: SccpDestinationBindingDomainInput,
): string;

export function tonSccpRouteCanaryEvidenceHash(
  input: TonSccpRouteCanaryEvidenceInput,
): string;

export function evmSccpDestinationBinding(
  input: EvmSccpDestinationBindingInput,
): EvmSccpDestinationBinding;

export function tronSccpDestinationBinding(
  input: TronSccpDestinationBindingInput,
): TronSccpDestinationBinding;

export interface TairaXorRouteHashInput {
  routeId?: string;
  route_id?: string;
  routeIdHash?: string;
  route_id_hash?: string;
  assetKey?: string;
  asset_key?: string;
  assetKeyHash?: string;
  asset_key_hash?: string;
}

export interface TairaXorTransferPayloadHashInput
  extends TairaXorTransferPayloadInput {}

export interface TairaXorBurnSourceEventDigestInput
  extends TairaXorRouteHashInput {
  bridgeAddress?: string | BinaryLike | number[];
  bridge_address?: string | BinaryLike | number[];
  burnerAddress?: string | BinaryLike | number[];
  burner_address?: string | BinaryLike | number[];
  burner?: string | BinaryLike | number[];
  tairaRecipientHash?: string;
  taira_recipient_hash?: string;
  tairaRecipientBytes?: BinaryLike | number[];
  taira_recipient_bytes?: BinaryLike | number[];
  /** Canonical TAIRA I105 account id when provided as text; use tairaRecipientBytes for raw bytes. */
  tairaRecipient?: string | BinaryLike | number[];
  /** Canonical TAIRA I105 account id when provided as text; use taira_recipient_bytes for raw bytes. */
  taira_recipient?: string | BinaryLike | number[];
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaAccountId?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_account_id?: string;
  amount: string | number | bigint;
  nonce?: string | number | bigint;
  burnNonce?: string | number | bigint;
  burn_nonce?: string | number | bigint;
}

export interface TairaXorFinalizeFromTairaCallDataInput
  extends Partial<TairaXorTransferPayloadInput> {
  proofBytes?: BinaryLike | number[];
  proof_bytes?: BinaryLike | number[];
  publicInputs?: SccpMessageTransparentPublicInputsInput;
  public_inputs?: SccpMessageTransparentPublicInputsInput;
  statementHash?: string;
  statement_hash?: string;
  /** Canonical SORA->TRON or SORA->BSC TAIRA XOR transfer payload bytes; optional cleartext fields must match. */
  canonicalPayloadBytes?: BinaryLike | number[];
  /** Canonical SORA->TRON or SORA->BSC TAIRA XOR transfer payload bytes; optional cleartext fields must match. */
  canonical_payload_bytes?: BinaryLike | number[];
  /** Canonical SORA->TRON or SORA->BSC TAIRA XOR transfer payload hex; optional cleartext fields must match. */
  canonicalPayloadHex?: string;
  /** Canonical SORA->TRON or SORA->BSC TAIRA XOR transfer payload hex; optional cleartext fields must match. */
  canonical_payload_hex?: string;
  /** Canonical SORA->TRON or SORA->BSC TAIRA XOR transfer payload bytes; optional cleartext fields must match. */
  payloadBytes?: BinaryLike | number[];
  /** Canonical SORA->TRON or SORA->BSC TAIRA XOR transfer payload bytes; optional cleartext fields must match. */
  payload_bytes?: BinaryLike | number[];
}

export interface TairaXorBurnToTairaCallDataInput
  extends TairaXorRouteHashInput {
  tairaRecipientBytes?: BinaryLike | number[];
  taira_recipient_bytes?: BinaryLike | number[];
  /** Canonical TAIRA I105 account id when provided as text; use tairaRecipientBytes for raw bytes. */
  tairaRecipient?: string | BinaryLike | number[];
  /** Canonical TAIRA I105 account id when provided as text; use taira_recipient_bytes for raw bytes. */
  taira_recipient?: string | BinaryLike | number[];
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  tairaAccountId?: string;
  /** Canonical TAIRA I105 account id; aliases such as name@taira are rejected. */
  taira_account_id?: string;
  amount: string | number | bigint;
}

export interface TairaXorBurnToTairaAccountCallDataInput
  extends TairaXorRouteHashInput {
  /** Canonical TAIRA I105 account id; raw bytes, hex strings, and aliases are rejected. */
  tairaRecipient?: string;
  /** Canonical TAIRA I105 account id; raw bytes, hex strings, and aliases are rejected. */
  taira_recipient?: string;
  /** Canonical TAIRA I105 account id; raw bytes, hex strings, and aliases are rejected. */
  tairaAccountId?: string;
  /** Canonical TAIRA I105 account id; raw bytes, hex strings, and aliases are rejected. */
  taira_account_id?: string;
  amount: string | number | bigint;
}

export interface TairaXorBscBurnToTairaAccountCallDataInput
  extends TairaXorBurnToTairaAccountCallDataInput {}

export function tairaXorRouteIdHash(routeId?: string): string;

export function tairaXorAssetKeyHash(assetKey?: string): string;

export function buildTairaXorTronToTairaTransferPayload(
  input: TairaXorTronToTairaTransferPayloadInput,
): Readonly<SccpTransferPayload>;

export function buildTairaXorBscToTairaTransferPayload(
  input: TairaXorBscToTairaTransferPayloadInput,
): Readonly<SccpTransferPayload>;

export function buildTairaXorTonToTairaTransferPayload(
  input: TairaXorTonToTairaTransferPayloadInput,
): Readonly<SccpTransferPayload>;

export function buildTairaXorSccpRecordDescriptor(
  input: TairaXorSccpRecordDescriptorInput,
): Readonly<TairaXorSccpRecordDescriptor>;

export function buildTairaXorBscSccpRecordDescriptor(
  input: TairaXorBscSccpRecordDescriptorInput,
): Readonly<TairaXorBscSccpRecordDescriptor>;

export function buildTairaXorTonSccpRecordDescriptor(
  input: TairaXorTonSccpRecordDescriptorInput,
): Readonly<TairaXorTonSccpRecordDescriptor>;

export function buildRecordSccpMessageInstructionBytes(
  payloadBytes: BinaryLike | number[],
): Uint8Array;

export function buildTairaXorSccpBurnRecordZkIvmRequest(
  input: TairaXorSccpBurnRecordZkIvmRequestInput,
): Readonly<TairaXorSccpBurnRecordZkIvmRequest>;

export function buildTairaXorBscSccpBurnRecordZkIvmRequest(
  input: TairaXorBscSccpBurnRecordZkIvmRequestInput,
): Readonly<TairaXorBscSccpBurnRecordZkIvmRequest>;

export function buildTairaXorTonSccpBurnRecordZkIvmRequest(
  input: TairaXorTonSccpBurnRecordZkIvmRequestInput,
): Readonly<TairaXorTonSccpBurnRecordZkIvmRequest>;

export function tairaXorTonToTairaTransferMessageId(
  input: TairaXorTonToTairaTransferPayloadInput,
  options?: { prefix?: boolean },
): string;

export function tairaXorTransferPayloadHash(
  input: TairaXorTransferPayloadHashInput,
  options?: { prefix?: boolean },
): string;

export function tairaXorBurnSourceEventDigest(
  input: TairaXorBurnSourceEventDigestInput,
): string;

export function tairaXorBscBurnSourceEventDigest(
  input: TairaXorBurnSourceEventDigestInput,
): string;

export function tairaXorFinalizeFromTairaCallData(
  input: TairaXorFinalizeFromTairaCallDataInput,
): string;

export function tairaXorBurnToTairaCallData(
  input: TairaXorBurnToTairaCallDataInput,
): string;

export function tairaXorBurnToTairaAccountCallData(
  input: TairaXorBurnToTairaAccountCallDataInput,
): string;

export function tairaXorBscBurnToTairaAccountCallData(
  input: TairaXorBscBurnToTairaAccountCallDataInput,
): string;

export function bindTairaXorTronBurnStartedEvent(
  input: TairaXorTronBurnStartedEventInput,
): Readonly<TairaXorTronBoundBurnStartedEvent>;

export function bindTairaXorTronToTairaSourceProofPackage(
  input: TairaXorTronToTairaSourceProofPackageInput,
): Readonly<TairaXorTronToTairaBoundSourceProofPackage>;

export function bindTairaXorBscToTairaSourceProofPackage(
  input: TairaXorBscToTairaSourceProofPackageInput,
): Readonly<TairaXorBscToTairaBoundSourceProofPackage>;

export function bindTairaXorTonToTairaSourceProofPackage(
  input: TairaXorTonToTairaSourceProofPackageInput,
): Readonly<TairaXorTonToTairaBoundSourceProofPackage>;

export function sccpSourceVerifierMaterialHash(
  input: SccpSourceVerifierMaterialInput,
): string;

export function sccpSourceAdapterEngineDeploymentHash(
  input: SccpSourceAdapterEngineDeploymentInput,
): string;

export function canonicalSccpTransferPayloadBytes(
  payload: SccpTransferPayload,
): Uint8Array;

export function canonicalSccpPayloadEnvelopeBytes(
  payload: Record<string, unknown>,
): Uint8Array;

export function canonicalSccpMessageProofBundleBytes(
  bundle: Record<string, unknown>,
): Uint8Array;

export function sccpTransferMessageId(
  payload: SccpTransferPayload,
  options?: { prefix?: boolean },
): string;

export function sccpPayloadHash(
  payload: Uint8Array | ArrayBufferView | ArrayBuffer | string,
  options?: { prefix?: boolean },
): string;

export function sccpMerkleRootFromCommitment(
  commitment: SccpHubCommitment,
  proof: SccpMerkleProof,
  options?: { prefix?: boolean },
): string;

export type NumericLike = string | number | bigint;

export type BinaryLike =
  | Buffer
  | ArrayBuffer
  | ArrayBufferView
  | ReadonlyArray<number>
  | string;

export interface ToriiBridgeProofSubmitPayload {
  authority: string;
  privateKey?: unknown;
  private_key?: unknown;
  publicKeyHex?: string;
  public_key_hex?: string;
  signatureB64?: string;
  signature_b64?: string;
  burnBundle?: Record<string, unknown>;
  burn_bundle?: Record<string, unknown>;
  messageBundle?: Record<string, unknown>;
  message_bundle?: Record<string, unknown>;
  networkIdHex?: BinaryLike;
  network_id_hex?: BinaryLike;
  verifierAddressHex?: string;
  verifier_address_hex?: string;
  bridgeAddressHex?: string;
  bridge_address_hex?: string;
  verifierCodeHashHex?: BinaryLike;
  verifier_code_hash_hex?: BinaryLike;
  verifierKeyHashHex?: BinaryLike;
  verifier_key_hash_hex?: BinaryLike;
  expectedDestinationBindingHashHex?: BinaryLike;
  expected_destination_binding_hash_hex?: BinaryLike;
  /** Checksummed TRON Base58Check verifier contract address. */
  tronVerifierAddress?: string;
  /** Checksummed TRON Base58Check verifier contract address. */
  tron_verifier_address?: string;
  proofBytesHex?: BinaryLike;
  proof_bytes_hex?: BinaryLike;
  creationTimeMs?: NumericLike;
  creation_time_ms?: NumericLike;
}

export {
  SCCP_CODEC_SOLANA_PUBKEY32,
  canonicalSccpMessagePublicInputsBytes,
  canonicalTairaSccpMessageBundleBytes,
  normalizeBridgeMessageSubmitPayload,
  sccpLaneIdHash,
} from "@iroha/iroha-js/sccp";
