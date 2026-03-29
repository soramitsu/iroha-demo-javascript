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
}
