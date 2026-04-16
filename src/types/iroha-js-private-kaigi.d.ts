/// <reference types="node" />

export {};

declare module "@iroha/iroha-js" {
  export interface PrivateKaigiEntrypointResult {
    transactionEntrypoint: Buffer;
    hash: Buffer;
    actionHash: Buffer;
  }

  export interface PrivateKaigiFeeSpendResult {
    asset_definition_id: string;
    anchor_root: Buffer;
    nullifiers: ReadonlyArray<Buffer>;
    output_commitments: ReadonlyArray<Buffer>;
    encrypted_change_payloads: ReadonlyArray<Buffer>;
    proof: Buffer;
  }

  export interface PrivateKaigiFeeSpendInput {
    chainId: string;
    assetDefinitionId: string;
    actionHash:
      | ArrayBufferView
      | ArrayBuffer
      | Buffer
      | ReadonlyArray<number>
      | string;
    anchorRootHex: string;
    feeAmount: string;
    verifyingKey: Record<string, unknown>;
  }

  export interface ConfidentialTransferProofInputV2 {
    amount: string;
    rhoHex?: string;
    rho?: Buffer | ArrayBuffer | ArrayBufferView | ReadonlyArray<number>;
    diversifierHex?: string;
    diversifier_hex?: string;
    diversifier?:
      | Buffer
      | ArrayBuffer
      | ArrayBufferView
      | ReadonlyArray<number>;
    leafIndex?: number;
    leaf_index?: number;
  }

  export interface ConfidentialTransferProofOutputV2 {
    amount: string;
    rhoHex?: string;
    rho?: Buffer | ArrayBuffer | ArrayBufferView | ReadonlyArray<number>;
    ownerTagHex?: string;
    owner_tag_hex?: string;
    ownerTag?: Buffer | ArrayBuffer | ArrayBufferView | ReadonlyArray<number>;
  }

  export interface ConfidentialTransferProofResultV2 {
    nullifiers: ReadonlyArray<Buffer>;
    outputCommitments: ReadonlyArray<Buffer>;
    root: Buffer;
    proof: Buffer;
  }

  export interface ConfidentialUnshieldProofResultV2 {
    nullifiers: ReadonlyArray<Buffer>;
    root: Buffer;
    proof: Buffer;
  }

  export interface ConfidentialUnshieldProofOutputV3 {
    amount: string;
    rhoHex?: string;
    rho?: Buffer | ArrayBuffer | ArrayBufferView | ReadonlyArray<number>;
  }

  export interface ConfidentialUnshieldProofResultV3 {
    nullifiers: ReadonlyArray<Buffer>;
    outputCommitments: ReadonlyArray<Buffer>;
    root: Buffer;
    proof: Buffer;
  }

  export interface PrivateCreateKaigiTransactionInput {
    chainId: string;
    call: Record<string, unknown>;
    artifacts: Record<string, unknown>;
    feeSpend: Record<string, unknown>;
    metadata?: Record<string, unknown> | string | null;
    creationTimeMs?: number | null;
    nonce?: number | null;
  }

  export interface PrivateJoinKaigiTransactionInput {
    chainId: string;
    callId: string;
    artifacts: Record<string, unknown>;
    feeSpend: Record<string, unknown>;
    metadata?: Record<string, unknown> | string | null;
    creationTimeMs?: number | null;
    nonce?: number | null;
  }

  export interface PrivateEndKaigiTransactionInput {
    chainId: string;
    callId: string;
    endedAtMs?: number | null;
    artifacts: Record<string, unknown>;
    feeSpend: Record<string, unknown>;
    metadata?: Record<string, unknown> | string | null;
    creationTimeMs?: number | null;
    nonce?: number | null;
  }

  export function buildPrivateKaigiFeeSpend(
    input: PrivateKaigiFeeSpendInput,
  ): PrivateKaigiFeeSpendResult;

  export function buildConfidentialTransferProofV2(input: {
    chainId: string;
    assetDefinitionId: string;
    spendKey: Buffer | ArrayBuffer | ArrayBufferView | ReadonlyArray<number>;
    treeCommitments: ReadonlyArray<
      string | Buffer | ArrayBuffer | ArrayBufferView | ReadonlyArray<number>
    >;
    inputs: ReadonlyArray<ConfidentialTransferProofInputV2>;
    outputs: ReadonlyArray<ConfidentialTransferProofOutputV2>;
    rootHintHex: string;
    verifyingKey: Record<string, unknown>;
  }): ConfidentialTransferProofResultV2;

  export function buildConfidentialUnshieldProofV2(input: {
    chainId: string;
    assetDefinitionId: string;
    spendKey: Buffer | ArrayBuffer | ArrayBufferView | ReadonlyArray<number>;
    treeCommitments: ReadonlyArray<
      string | Buffer | ArrayBuffer | ArrayBufferView | ReadonlyArray<number>
    >;
    inputs: ReadonlyArray<ConfidentialTransferProofInputV2>;
    publicAmount: string;
    rootHintHex: string;
    verifyingKey: Record<string, unknown>;
  }): ConfidentialUnshieldProofResultV2;

  export function buildConfidentialUnshieldProofV3(input: {
    chainId: string;
    assetDefinitionId: string;
    spendKey: Buffer | ArrayBuffer | ArrayBufferView | ReadonlyArray<number>;
    treeCommitments: ReadonlyArray<
      string | Buffer | ArrayBuffer | ArrayBufferView | ReadonlyArray<number>
    >;
    inputs: ReadonlyArray<ConfidentialTransferProofInputV2>;
    outputs?: ReadonlyArray<ConfidentialUnshieldProofOutputV3>;
    publicAmount: string;
    rootHintHex: string;
    verifyingKey: Record<string, unknown>;
  }): ConfidentialUnshieldProofResultV3;

  export function buildPrivateCreateKaigiTransaction(
    input: PrivateCreateKaigiTransactionInput,
  ): PrivateKaigiEntrypointResult;

  export function buildPrivateJoinKaigiTransaction(
    input: PrivateJoinKaigiTransactionInput,
  ): PrivateKaigiEntrypointResult;

  export function buildPrivateEndKaigiTransaction(
    input: PrivateEndKaigiTransactionInput,
  ): PrivateKaigiEntrypointResult;

  export function submitTransactionEntrypoint(
    client: unknown,
    transactionEntrypoint: ArrayBufferView | ArrayBuffer | Buffer,
    options: {
      hashHex: string;
      waitForCommit?: boolean;
      pollIntervalMs?: number;
      timeoutMs?: number;
    },
  ): Promise<{ hash: string; submission: unknown; status?: unknown }>;

  export interface UnshieldInstructionInput {
    outputs?: ReadonlyArray<
      string | Buffer | ArrayBuffer | ArrayBufferView | ReadonlyArray<number>
    >;
  }
}

declare module "@iroha/iroha-js/crypto" {
  export function deriveConfidentialOwnerTagV2(
    spendKey: Buffer | ArrayBuffer | ArrayBufferView | ReadonlyArray<number>,
    options?: {
      diversifierHex?: string;
      diversifier?:
        | Buffer
        | ArrayBuffer
        | ArrayBufferView
        | ReadonlyArray<number>;
    },
  ): Buffer;

  export function deriveConfidentialDiversifierV2(
    seed:
      | Buffer
      | ArrayBuffer
      | ArrayBufferView
      | ReadonlyArray<number>
      | string,
  ): { diversifier: Buffer; diversifierHex: string };

  export function deriveConfidentialReceiveAddressV2(input: {
    spendKey: Buffer | ArrayBuffer | ArrayBufferView | ReadonlyArray<number>;
    diversifierSeed:
      | Buffer
      | ArrayBuffer
      | ArrayBufferView
      | ReadonlyArray<number>
      | string;
  }): {
    ownerTag: Buffer;
    ownerTagHex: string;
    diversifier: Buffer;
    diversifierHex: string;
  };

  export function deriveConfidentialNoteV2(input: {
    assetDefinitionId: string;
    amount: string;
    rhoHex?: string;
    rho?: Buffer | ArrayBuffer | ArrayBufferView | ReadonlyArray<number>;
    ownerTagHex?: string;
    ownerTag?: Buffer | ArrayBuffer | ArrayBufferView | ReadonlyArray<number>;
  }): { commitment: Buffer; commitmentHex: string };

  export function deriveConfidentialNullifierV2(input: {
    chainId: string;
    assetDefinitionId: string;
    spendKey: Buffer | ArrayBuffer | ArrayBufferView | ReadonlyArray<number>;
    rhoHex?: string;
    rho?: Buffer | ArrayBuffer | ArrayBufferView | ReadonlyArray<number>;
  }): { nullifier: Buffer; nullifierHex: string };
}
