export interface SccpCodecCapabilityView {
  id: number;
  key: string;
  description: string;
}

export interface SccpCounterpartyCapabilityView {
  domain: number;
  chain: string;
  verifierBackendKey: string;
  messageBackend: string;
  registryBackend: string;
  counterpartyAccountCodec: number;
  counterpartyAccountCodecKey: string;
  destinationRollout: SccpDestinationRolloutView | null;
  productionReady: boolean;
  disabledReason: string | null;
}

export interface SccpCapabilitiesResponse {
  localDomain: number;
  localChain: string;
  proofFamily: string;
  burnBundlePath: string;
  messageBundlePath: string;
  messageProofPath: string;
  messageJobPath: string;
  recentMessagesPath: string;
  proofManifestPath: string;
  burnRegistryBackend: string;
  proofSubmitPath: string | null;
  messageSubmitPath: string | null;
  messagePayloadKinds: readonly string[];
  codecs: readonly SccpCodecCapabilityView[];
  counterparties: readonly SccpCounterpartyCapabilityView[];
}

export interface SccpDestinationBindingView {
  version: number;
  key: string;
  bindingHash: string;
}

export interface SccpDestinationRolloutView {
  version: number;
  verifierPlan: string;
  immutableVerifierReady: boolean;
  anchorsReady: boolean;
  verifierIdentity: string | null;
  verifierCodeHash: string | null;
  verifierKeyHash: string | null;
  destinationNetworkId: string | null;
  destinationBridgeAddress: string | null;
  destinationBindingKey: string | null;
  destinationBindingHash: string | null;
  anchorId: string | null;
  blockers: readonly string[];
}

export interface SccpSubmissionArgumentView {
  key: string;
  description: string;
}

export interface SccpCounterpartySubmissionTemplateView {
  version: number;
  encoding: string;
  submissionKind: string;
  verifierEntrypoint: string;
  requiredArguments: readonly SccpSubmissionArgumentView[];
}

export interface SccpTairaXorBurnRecordMaterialView {
  settlementAssetDefinitionId: string;
  contractArtifactB64: string;
  artifactSha256?: string;
  vkRef: {
    backend: string;
    name: string;
  };
  gasLimit?: number;
}

export interface SccpPostDeployLiveEvidenceView {
  fullTomlReady: boolean;
  sourceBridgeConfigHash: string;
  sourceEventTransactionId: string;
  routeCanaryEvidenceHash: string;
  routeCanaryTransactionId: string;
  offlineFullTomlSha256?: string;
}

export interface SccpProofManifestView {
  version: number;
  routeId?: string;
  assetKey?: string;
  localDomain: number;
  localChain: string;
  counterpartyDomain: number;
  chain: string;
  proofFamily: string;
  securityModel: string;
  anchorGovernance: string;
  destinationBinding: SccpDestinationBindingView;
  verifierBackendKey: string;
  messageBackend: string;
  registryBackend: string;
  counterpartyAccountCodec: number;
  counterpartyAccountCodecKey: string;
  finalityModel: string;
  verifierTarget: string;
  manifestSeed: string;
  requiredPublicInputs: readonly string[];
  messagePayloadKinds: readonly string[];
  destinationRollout: SccpDestinationRolloutView | null;
  productionReady: boolean;
  disabledReason: string | null;
  tronBridgeAddress?: string;
  tairaXorBridgeAddress?: string;
  tairaXorTokenAddress?: string;
  sccpTronSourceBridgeAddress?: string;
  tronSourceBridgeAddress?: string;
  tronVerifierAddress?: string;
  postDeployLiveEvidence?: SccpPostDeployLiveEvidenceView;
  submissionTemplate: SccpCounterpartySubmissionTemplateView;
  tairaXorBurnRecord: SccpTairaXorBurnRecordMaterialView | null;
}

export interface SccpProofManifestSetResponse {
  localDomain: number;
  localChain: string;
  proofFamily: string;
  manifests: readonly SccpProofManifestView[];
  routes?: readonly Record<string, unknown>[];
}

export interface SccpSoraOutboundMaterialResponse {
  version: 1;
  registry_revision: string;
  route_key: {
    lane_id: {
      source: { network: string; profile: null };
      target: { network: string; profile: null };
    };
    route_id: string;
    asset_key: string;
    revision: number;
  };
  route_configuration_hash: string;
  destination_binding_hash: string;
  settlement_asset_definition_id: string;
  policy: {
    version: 1;
    semantics: "ivm_proved_record_sccp_message_v1";
    contract_artifact_sha256: string;
    vk_ref: {
      backend: string;
      name: string;
      version: number;
      commitment: string;
    };
    gas_limit: number;
  };
  contract_artifact_b64: string;
  contract_code_hash: string;
  verifying_key_version: number;
}

export interface SccpRecentMessagesResponse {
  items: Record<string, unknown>[];
  total: number;
  raw: Record<string, unknown>;
}

export interface SccpDestinationProofMaterialInput {
  networkIdHex?: string;
  verifierAddressHex?: string;
  bridgeAddressHex?: string;
  verifierCodeHashHex?: string;
  verifierKeyHashHex?: string;
  expectedDestinationBindingHashHex?: string;
  tronVerifierAddress?: string;
  proofBytesHex?: string;
}

export interface SccpMessageProofInput
  extends SccpDestinationProofMaterialInput {
  toriiUrl: string;
  messageId: string;
}

export interface SccpMessageProofBundleInput {
  toriiUrl: string;
  messageId: string;
}

export interface SccpBscProofGenerateInput {
  request: Record<string, unknown>;
  proverModuleUrl?: string;
  proverConfigUrl?: string;
  timeoutMs?: number;
}

export interface SccpBscSourceProofGenerateInput {
  input: Record<string, unknown>;
  proverModuleUrl?: string;
  proverConfigUrl?: string;
  timeoutMs?: number;
}

export interface SccpSourceProofDeploymentRebuildInput {
  proofPackage: Record<string, unknown>;
  sourceVerifierMaterial: Record<string, unknown>;
  sourceAdapterEngineDeployment: Record<string, unknown>;
  label?: string;
}

export interface SccpBridgeProofSubmitInput
  extends SccpDestinationProofMaterialInput {
  toriiUrl: string;
  accountId: string;
  destinationProofB64?: string;
  burnBundle?: Record<string, unknown>;
  messageBundle?: Record<string, unknown>;
  publicKeyHex?: string;
  signatureB64?: string;
  transactionPayloadB64?: string;
  creationTimeMs?: number | string;
}

export interface SccpBridgeMessageSubmitInput
  extends SccpDestinationProofMaterialInput {
  toriiUrl: string;
  accountId: string;
  nativeProofB64?: string;
  messageBundle?: Record<string, unknown>;
  publicKeyHex?: string;
  signatureB64?: string;
  transactionPayloadB64?: string;
  receiptLane?: number | string;
  settlement?: Record<string, unknown>;
  creationTimeMs?: number | string;
}

export interface SccpRecentMessagesInput {
  toriiUrl: string;
  routeId?: string;
  limit?: number;
  offset?: number;
}

export interface ZkIvmVerifyingKeyRefInput {
  backend: string;
  name: string;
}

export interface ZkIvmRequestInput {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  vkRef: ZkIvmVerifyingKeyRefInput;
  authority: string;
  metadata?: Record<string, unknown>;
  bytecode: string | number[] | Record<string, unknown>;
  proved?: Record<string, unknown>;
}

export interface ZkIvmProveJobInput {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
  jobId: string;
}

export interface ZkIvmProvedTransactionSubmitInput {
  toriiUrl: string;
  chainId: string;
  accountId: string;
  networkPrefix: number;
  privateKeyHex?: never;
  proved: Record<string, unknown>;
  attachment: Record<string, unknown>;
  gasLimit?: string | number;
  metadata?: Record<string, unknown>;
  creationTimeMs?: number;
  ttlMs?: number;
  nonce?: number;
}

export interface TronGatewayInput {
  endpoint?: string;
}

export interface TronTransactionInput extends TronGatewayInput {
  txId: string;
}

export interface TronAccountInput extends TronGatewayInput {
  address: string;
}

export interface TronBlockInput extends TronGatewayInput {
  blockNumber?: number | string;
}

export interface TronEventsInput extends TronGatewayInput {
  txId: string;
}

export interface TronBroadcastInput extends TronGatewayInput {
  transaction: Record<string, unknown>;
}

export interface SccpNileTestTronSignerStatus {
  enabled: boolean;
  network: "nile";
  address: string;
  reason?: string;
}

export interface SccpNileTestTronTransactionSignInput {
  transaction: Record<string, unknown>;
  ownerAddress?: string;
}

export type TronContractParameterInput =
  | {
      parameter: string;
      callData?: never;
    }
  | {
      callData: string;
      parameter?: never;
    }
  | {
      parameter?: undefined;
      callData?: undefined;
    };

export type TronTriggerSmartContractInput = TronGatewayInput &
  TronContractParameterInput & {
    ownerAddress: string;
    contractAddress: string;
    functionSelector: string;
    feeLimit?: number | string;
    callValue?: number | string;
    permissionId?: number | string;
  };

export type TronConstantContractInput = TronGatewayInput &
  TronContractParameterInput & {
    ownerAddress: string;
    contractAddress: string;
    functionSelector: string;
  };

export interface EvmRpcInput {
  endpoint?: string;
}

export interface EvmRpcCallInput extends EvmRpcInput {
  method: string;
  params?: unknown[];
}

export interface EvmTransactionInput extends EvmRpcInput {
  txHash: string;
}

export interface EvmAddressInput extends EvmRpcInput {
  address: string;
  blockTag?: string;
}

export interface EvmCallInput extends EvmRpcInput {
  to: string;
  data: string;
  from?: string;
  value?: string;
  blockTag?: string;
}

export interface EvmLogsInput extends EvmRpcInput {
  address?: string | string[];
  blockHash?: string;
  fromBlock?: string;
  toBlock?: string;
  topics?: Array<string | string[] | null>;
}

export interface SolanaRpcInput {
  endpoint?: string;
}

export interface SolanaRpcCallInput extends SolanaRpcInput {
  method: string;
  params?: unknown[];
}

export interface SolanaAddressInput extends SolanaRpcInput {
  address: string;
}

export interface SolanaTokenBalanceInput extends SolanaRpcInput {
  ownerAddress: string;
  mintAddress: string;
}

export interface SolanaAssociatedTokenAccountInput extends SolanaRpcInput {
  payerAddress: string;
  ownerAddress: string;
  mintAddress: string;
}

export interface SolanaTransactionInput extends SolanaRpcInput {
  signature: string;
}

export interface SolanaBroadcastInput extends SolanaRpcInput {
  transactionB64: string;
  expectedUnsignedTransactionB64: string;
}

export interface SolanaInstructionAccountMetaInput {
  pubkey: string;
  isSigner?: boolean;
  signer?: boolean;
  isWritable?: boolean;
  writable?: boolean;
}

export interface SolanaInstructionInput {
  programId: string;
  accounts?: SolanaInstructionAccountMetaInput[];
  dataHex: string;
}

export interface SolanaBuildTransactionInput extends SolanaRpcInput {
  feePayer: string;
  instructions: SolanaInstructionInput[];
  recentBlockhash?: string;
}

export interface SolanaPreparedAssociatedTokenAccount {
  associatedTokenAddress: string;
  exists: boolean;
  createInstruction: SolanaInstructionInput | null;
}
