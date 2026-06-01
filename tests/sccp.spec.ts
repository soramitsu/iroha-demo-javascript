import { describe, expect, it } from "vitest";
import {
  bridgeDecimalToBaseUnits,
  bindTronToTairaSourceProofPackage,
  buildTairaXorInboundSettlement,
  buildTairaXorFinalizeProofBinding,
  buildTairaXorFinalizeTriggerRequest,
  buildTairaXorBurnTriggerRequest,
  buildTairaXorOutboundBurnRecordRequest,
  buildTairaXorOutboundPreview,
  decodeTronBase58CheckAddress,
  isTairaSccpNetwork,
  isValidSccpMessageId,
  isValidTronBase58CheckAddress,
  isValidTronTransactionId,
  normalizeBridgeAmount,
  normalizeSccpMessageId,
  normalizeTronTransactionId,
  readSccpTairaBurnRecordMaterial,
  readSccpTronBridgeAddress,
  readSccpTronProofMaterial,
  readSccpTronTokenAddress,
  resolveSccpRouteReadiness,
  TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
  TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
  SCCP_SORA_DOMAIN,
  SCCP_TRON_DOMAIN,
  TRON_MAINNET_CAIP_CHAIN_ID,
  walletConnectSessionFromAddress,
} from "@/utils/sccp";
import {
  canonicalSccpTransferPayloadBytes,
  SCCP_CODEC_TEXT_UTF8,
  SCCP_CODEC_TRON_BASE58CHECK,
  SCCP_GROTH16_BN254_PROOF_ABI_BYTE_LENGTH_V1,
  sccpPayloadHash,
  sccpTransferMessageId,
  tronSccpDestinationBinding,
} from "@iroha/iroha-js/sccp";
import {
  buildTronSccpProofPackage,
  generateTronSccpProofPackage,
  serializeSccpValue,
} from "@/utils/sccpProofPackage";
import { TAIRA_CHAIN_ID, TAIRA_NETWORK_PREFIX } from "@/constants/chains";

const VALID_TRON_ADDRESS = "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8";
const VALID_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const BURN_RECORD_MATERIAL = {
  tairaXorBurnRecord: {
    settlementAssetDefinitionId: VALID_ASSET_DEFINITION_ID,
    contractArtifactB64: "TnJ0MA==",
    vkRef: {
      backend: "halo2/ipa",
      name: "taira-xor-burn-record-v1",
    },
    gasLimit: 123456,
  },
};
const HEX32_A = `0x${"11".repeat(32)}`;
const HEX32_B = `0x${"22".repeat(32)}`;
const HEX32_C = `0x${"33".repeat(32)}`;
const HEX32_D = `0x${"44".repeat(32)}`;
const HEX32_E = `0x${"55".repeat(32)}`;
const HEX32_F = `0x${"66".repeat(32)}`;
const TRON_TX_ID = "aa".repeat(32);

const bytesToHex = (bytes: Uint8Array): string =>
  `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

const abiWord = (value: bigint): Uint8Array => {
  let remaining = value;
  const out = new Uint8Array(32);
  for (let index = out.length - 1; index >= 0; index -= 1) {
    out[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return out;
};

const BN254_G2_GENERATOR_WORDS = [
  abiWord(0x1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6edn),
  abiWord(0x198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2n),
  abiWord(0x12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daan),
  abiWord(0x090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975bn),
];

const groth16ProofBytes = (): Uint8Array => {
  const out = new Uint8Array(SCCP_GROTH16_BN254_PROOF_ABI_BYTE_LENGTH_V1);
  [
    abiWord(1n),
    Uint8Array.from({ length: 32 }, () => 0x11),
    abiWord(0n),
    Uint8Array.from({ length: 32 }, () => 0x33),
    abiWord(1n),
    abiWord(2n),
    ...BN254_G2_GENERATOR_WORDS,
    abiWord(1n),
    abiWord(2n),
  ].forEach((word, index) => out.set(word, index * 32));
  return out;
};

const TAIRA_SENDER = "testu1234567890abcdef";
const BRIDGE_AMOUNT_DECIMAL = "0.0001";
const BRIDGE_AMOUNT_BASE_UNITS = "100000000000000";
const TRON_DESTINATION_BINDING_KEY = `tron:0:${SCCP_TRON_DOMAIN}:${HEX32_C.slice(
  2,
)}:${VALID_TRON_ADDRESS}:${HEX32_D}:${HEX32_E}`;
const TRON_DESTINATION_BINDING = tronSccpDestinationBinding({
  version: 1,
  key: TRON_DESTINATION_BINDING_KEY,
  sourceDomain: 0,
  targetDomain: SCCP_TRON_DOMAIN,
  networkId: HEX32_C,
  verifierAddress: VALID_TRON_ADDRESS,
  verifierCodeHash: HEX32_D,
  verifierKeyHash: HEX32_E,
});
const READY_TRON_MANIFEST = {
  tronBridgeAddress: VALID_TRON_ADDRESS,
  tronTokenAddress: VALID_TRON_ADDRESS,
  destinationBinding: {
    version: 1,
    key: TRON_DESTINATION_BINDING.key,
    bindingHash: TRON_DESTINATION_BINDING.bindingHash,
  },
  destinationRollout: {
    verifierIdentity: VALID_TRON_ADDRESS,
    verifierCodeHash: HEX32_D,
    verifierKeyHash: HEX32_E,
    destinationNetworkId: HEX32_C,
    destinationBindingKey: TRON_DESTINATION_BINDING.key,
    destinationBindingHash: TRON_DESTINATION_BINDING.bindingHash,
  },
  ...BURN_RECORD_MATERIAL,
};

const sampleTairaToTronJob = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => {
  const recipientPayload = bytesToHex(
    decodeTronBase58CheckAddress(VALID_TRON_ADDRESS),
  );
  const transferProjection = {
    source_domain: 0,
    dest_domain: SCCP_TRON_DOMAIN,
    asset_home_domain: 0,
    asset_id: { kind: "TextUtf8", value: "xor" },
    route_id: { kind: "TextUtf8", value: "taira_tron_xor" },
    amount: BRIDGE_AMOUNT_BASE_UNITS,
    sender: { kind: "TextUtf8", value: TAIRA_SENDER },
    recipient: { kind: "TronBase58Check", payload: recipientPayload },
  };
  const transferPayload = {
    version: 1,
    source_domain: 0,
    dest_domain: SCCP_TRON_DOMAIN,
    nonce: "7",
    asset_home_domain: 0,
    asset_id_codec: SCCP_CODEC_TEXT_UTF8,
    asset_id: "xor",
    amount: BRIDGE_AMOUNT_BASE_UNITS,
    sender_codec: SCCP_CODEC_TEXT_UTF8,
    sender: TAIRA_SENDER,
    recipient_codec: SCCP_CODEC_TRON_BASE58CHECK,
    recipient: VALID_TRON_ADDRESS,
    route_id_codec: SCCP_CODEC_TEXT_UTF8,
    route_id: "taira_tron_xor",
  };
  return {
    publicInputs: {
      version: 1,
      messageId: HEX32_A,
      payloadHash: HEX32_B,
      targetDomain: SCCP_TRON_DOMAIN,
      commitmentRoot: HEX32_C,
      finalityHeight: 10,
      finalityBlockHash: HEX32_F,
    },
    destinationBinding: {
      version: 1,
      key: TRON_DESTINATION_BINDING.key,
      bindingHash: TRON_DESTINATION_BINDING.bindingHash,
    },
    payloadProjection: {
      kind: "Transfer",
      value: transferProjection,
    },
    bundle: {
      version: 1,
      commitmentRoot: HEX32_C,
      commitment: {
        version: 1,
        kind: "Transfer",
        targetDomain: SCCP_TRON_DOMAIN,
        messageId: HEX32_A,
        payloadHash: HEX32_B,
      },
      merkleProof: { steps: [] },
      payload: {
        kind: "Transfer",
        value: transferPayload,
      },
      finalityProof: "0x010203",
    },
    ...overrides,
  };
};

const sampleTronToTairaProofPackage = (
  mutate?: (packageRecord: Record<string, unknown>) => void,
): Record<string, unknown> => {
  const transferPayload = {
    version: 1,
    source_domain: SCCP_TRON_DOMAIN,
    dest_domain: SCCP_SORA_DOMAIN,
    nonce: "9",
    asset_home_domain: SCCP_SORA_DOMAIN,
    asset_id_codec: SCCP_CODEC_TEXT_UTF8,
    asset_id: "xor",
    amount: BRIDGE_AMOUNT_BASE_UNITS,
    sender_codec: SCCP_CODEC_TRON_BASE58CHECK,
    sender: VALID_TRON_ADDRESS,
    recipient_codec: SCCP_CODEC_TEXT_UTF8,
    recipient: TAIRA_SENDER,
    route_id_codec: SCCP_CODEC_TEXT_UTF8,
    route_id: "taira_tron_xor",
  };
  const payloadHash = sccpPayloadHash(
    canonicalSccpTransferPayloadBytes(transferPayload),
  );
  const messageId = sccpTransferMessageId(transferPayload);
  const messageBundle = {
    version: 1,
    commitmentRoot: HEX32_F,
    commitment: {
      version: 1,
      kind: "Transfer",
      targetDomain: SCCP_SORA_DOMAIN,
      messageId,
      payloadHash,
    },
    merkleProof: { steps: [] },
    payload: {
      kind: "Transfer",
      value: transferPayload,
    },
    finalityProof: "0x010203",
  };
  const packageRecord = {
    messageBundle,
    settlement: {
      entrypoint: "finalize_inbound",
      route: "taira_tron_xor",
    },
    sourceEventDigest: HEX32_D,
    txId: TRON_TX_ID,
    messageId,
    commitmentRoot: HEX32_F,
  };
  mutate?.(packageRecord);
  return packageRecord;
};

describe("SCCP helpers", () => {
  it("gates the bridge to TAIRA chain id and network prefix", () => {
    expect(
      isTairaSccpNetwork({
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      }),
    ).toBe(true);
    expect(
      isTairaSccpNetwork({
        chainId: "00000000-0000-0000-0000-000000000000",
        networkPrefix: 753,
      }),
    ).toBe(false);
  });

  it("validates TRON Base58Check mainnet addresses", () => {
    expect(isValidTronBase58CheckAddress(VALID_TRON_ADDRESS)).toBe(true);
    expect(decodeTronBase58CheckAddress(VALID_TRON_ADDRESS)[0]).toBe(0x41);
    expect(
      isValidTronBase58CheckAddress("TJRabPrwbZy45sbavfcjinPJC18kjpRTv9"),
    ).toBe(false);
    expect(isValidTronBase58CheckAddress("0x" + "11".repeat(20))).toBe(false);
  });

  it("normalizes positive bridge amounts and rejects invalid values", () => {
    expect(normalizeBridgeAmount(" 0.0001 ")).toBe("0.0001");
    expect(() => normalizeBridgeAmount("0")).toThrow(/greater than zero/);
    expect(() => normalizeBridgeAmount("-1")).toThrow(/positive decimal/);
    expect(() => normalizeBridgeAmount("1.1234567890123456789")).toThrow(
      /positive decimal/,
    );
  });

  it("converts bridge decimals to base units without floating point loss", () => {
    expect(bridgeDecimalToBaseUnits("1")).toBe("1000000000000000000");
    expect(bridgeDecimalToBaseUnits("0.000000000000000001")).toBe("1");
    expect(bridgeDecimalToBaseUnits("123456789.123456789123456789")).toBe(
      "123456789123456789123456789",
    );
    expect(() => bridgeDecimalToBaseUnits("1.0000000000000000001")).toThrow(
      /positive decimal/,
    );
    expect(() => bridgeDecimalToBaseUnits("1", 37)).toThrow(/unsupported/);
  });

  it("normalizes SCCP message IDs and TRON transaction IDs before fetches", () => {
    expect(normalizeSccpMessageId(` 0X${"AB".repeat(32)} `)).toBe(
      `0x${"ab".repeat(32)}`,
    );
    expect(isValidSccpMessageId(`0x${"11".repeat(32)}`)).toBe(true);
    expect(isValidSccpMessageId("11".repeat(32))).toBe(false);
    expect(normalizeTronTransactionId(` 0X${"CD".repeat(32)} `)).toBe(
      "cd".repeat(32),
    );
    expect(isValidTronTransactionId("ef".repeat(32))).toBe(true);
    expect(isValidTronTransactionId("0x1234")).toBe(false);
  });

  it("requires a production TRON manifest for route readiness", () => {
    const capabilities = {
      proofSubmitPath: "/v1/bridge/proofs/submit",
      messageSubmitPath: "/v1/bridge/messages",
    };
    const manifestSet = {
      manifests: [
        {
          counterpartyDomain: SCCP_TRON_DOMAIN,
          verifierTarget: "TronContract",
          productionReady: true,
          routeId: "taira_tron_xor",
          assetKey: "xor",
          tronBridgeAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
          tronTokenAddress: "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8",
          ...BURN_RECORD_MATERIAL,
        },
      ],
    };

    expect(
      resolveSccpRouteReadiness({
        connection: {
          chainId: TAIRA_CHAIN_ID,
          networkPrefix: TAIRA_NETWORK_PREFIX,
        },
        capabilities,
        manifestSet,
      }).ready,
    ).toBe(true);
    expect(
      resolveSccpRouteReadiness({
        connection: {
          chainId: TAIRA_CHAIN_ID,
          networkPrefix: TAIRA_NETWORK_PREFIX,
        },
        capabilities,
        manifestSet,
      }).ready,
    ).toBe(true);
  });

  it("builds TRON burn trigger requests from route manifest material", () => {
    const request = buildTairaXorBurnTriggerRequest({
      manifest: {
        tronBridgeAddress: VALID_TRON_ADDRESS,
      },
      ownerAddress: VALID_TRON_ADDRESS,
      tairaRecipient: "testu1234567890abcdef",
      amountDecimal: "1.5",
    });

    expect(request).toMatchObject({
      ownerAddress: VALID_TRON_ADDRESS,
      contractAddress: VALID_TRON_ADDRESS,
      functionSelector: TAIRA_XOR_BURN_TO_TAIRA_ABI_V1,
      feeLimit: 100_000_000,
    });
    expect(request.callData).toMatch(/^0x[0-9a-f]+$/u);
    expect(request.callData.length).toBeGreaterThan(8);
    expect(() =>
      buildTairaXorBurnTriggerRequest({
        manifest: {},
        ownerAddress: VALID_TRON_ADDRESS,
        tairaRecipient: "testu1234567890abcdef",
        amountDecimal: "1",
      }),
    ).toThrow(/deployment address/);
  });

  it("reads TRON deployment evidence from normalized SCCP manifests", () => {
    const manifest = {
      taira_xor_bridge_address: VALID_TRON_ADDRESS,
      taira_xor_token_address: VALID_TRON_ADDRESS,
      destinationRollout: {
        verifierIdentity: VALID_TRON_ADDRESS,
        verifierCodeHash: HEX32_A,
        verifierKeyHash: HEX32_B,
        destinationNetworkId: HEX32_C,
        destinationBindingHash: HEX32_D,
      },
    };

    expect(readSccpTronBridgeAddress(manifest)).toBe(VALID_TRON_ADDRESS);
    expect(readSccpTronTokenAddress(manifest)).toBe(VALID_TRON_ADDRESS);
    expect(readSccpTronProofMaterial(manifest)).toEqual({
      networkIdHex: HEX32_C,
      tronVerifierAddress: VALID_TRON_ADDRESS,
      verifierCodeHashHex: HEX32_A,
      verifierKeyHashHex: HEX32_B,
      expectedDestinationBindingHashHex: HEX32_D,
    });
    expect(
      readSccpTronProofMaterial({
        destinationRollout: {
          verifierIdentity: VALID_TRON_ADDRESS,
          verifierCodeHash: HEX32_A,
        },
      }),
    ).toBeNull();
  });

  it("reads TAIRA burn-record material and builds ZK IVM requests", () => {
    const manifest = {
      tronBridgeAddress: VALID_TRON_ADDRESS,
      ...BURN_RECORD_MATERIAL,
    };

    expect(readSccpTairaBurnRecordMaterial(manifest)).toEqual({
      settlementAssetDefinitionId: VALID_ASSET_DEFINITION_ID,
      contractArtifactB64: "TnJ0MA==",
      vkRef: {
        backend: "halo2/ipa",
        name: "taira-xor-burn-record-v1",
      },
      gasLimit: 123456,
    });

    const result = buildTairaXorOutboundBurnRecordRequest({
      manifest,
      tairaSender: "testu1234567890abcdef",
      tronRecipient: VALID_TRON_ADDRESS,
      amountDecimal: "2.25",
      nonce: "7",
    });

    expect(result.outbound.messageId).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(result.zkIvmRequest.request).toMatchObject({
      authority: "testu1234567890abcdef",
      bytecode: "TnJ0MA==",
      vkRef: {
        backend: "halo2/ipa",
        name: "taira-xor-burn-record-v1",
      },
    });
    expect(result.zkIvmRequest.request.metadata).toMatchObject({
      gas_limit: 123456,
      contract_entrypoint: "burn_and_record",
      contract_payload: {
        sender: "testu1234567890abcdef",
        settlement_asset: VALID_ASSET_DEFINITION_ID,
        amount: "2250000000000000000",
      },
    });
    expect(
      String(
        (
          result.zkIvmRequest.request.metadata.contract_payload as Record<
            string,
            unknown
          >
        ).record_instruction,
      ),
    ).toMatch(/^0x4e525430[0-9a-f]+$/u);
  });

  it("rejects unsafe or incomplete TAIRA burn-record request material", () => {
    expect(() =>
      buildTairaXorOutboundBurnRecordRequest({
        manifest: {
          tronBridgeAddress: VALID_TRON_ADDRESS,
        },
        tairaSender: "testu1234567890abcdef",
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: "1",
        nonce: "7",
      }),
    ).toThrow(/burn-record ZK contract material/);

    expect(() =>
      buildTairaXorOutboundBurnRecordRequest({
        manifest: {
          tronBridgeAddress: VALID_TRON_ADDRESS,
          tairaXorBurnRecord: {
            ...BURN_RECORD_MATERIAL.tairaXorBurnRecord,
            settlementAssetDefinitionId: "xor#universal",
          },
        },
        tairaSender: "testu1234567890abcdef",
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: "1",
        nonce: "7",
      }),
    ).toThrow(/canonical asset definition id/);

    expect(() =>
      buildTairaXorOutboundBurnRecordRequest({
        manifest: {
          tronBridgeAddress: VALID_TRON_ADDRESS,
          ...BURN_RECORD_MATERIAL,
        },
        tairaSender: "testu1234567890abcdef",
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: "1",
        nonce: "7",
        authority: "testu0000000000000000",
      }),
    ).toThrow(/authority must match/i);
  });

  it("builds TAIRA to TRON canonical outbound previews from SDK bindings", () => {
    const preview = buildTairaXorOutboundPreview({
      manifest: {
        tronBridgeAddress: VALID_TRON_ADDRESS,
      },
      tairaSender: "testu1234567890abcdef",
      tronRecipient: VALID_TRON_ADDRESS,
      amountDecimal: "2.25",
      nonce: "7",
    });

    expect(preview.payload).toMatchObject({
      source_domain: 0,
      dest_domain: SCCP_TRON_DOMAIN,
      asset_id: "xor",
      amount: "2250000000000000000",
      recipient: VALID_TRON_ADDRESS,
      route_id: "taira_tron_xor",
    });
    expect(preview.messageId).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(preview.payloadHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(preview.contractPayloadHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(preview.canonicalPayloadHex).toMatch(/^0x[0-9a-f]+$/u);
    expect(preview.recordDescriptor).toMatchObject({
      execution_kind: "ivm_proved_record_sccp_message_v1",
      chain_id: TAIRA_CHAIN_ID,
      network_prefix: TAIRA_NETWORK_PREFIX,
      message_id: preview.messageId,
      canonical_payload_hex: preview.canonicalPayloadHex,
      execution_requirements: {
        executable: "IvmProved",
        overlay_instruction: "RecordSccpMessage",
        settlement_instruction: "Burn<Numeric, Asset>",
        settlement_asset_selector: "nexus.fees.fee_asset_id",
        settlement_asset_key: "xor",
        settlement_account_binding:
          "burn.destination.account == payload.sender",
        settlement_amount_binding:
          "sum(whole-unit burns) >= sum(recorded amounts) per sender",
        proof_gate: "sccp_recording_proof_verified",
        normal_transaction_supported: false,
      },
    });
    expect(preview.recordDescriptor.record_instruction).toMatchObject({
      kind: "RecordSccpMessage",
      payload_bytes_hex: preview.canonicalPayloadHex,
    });
    expect(() =>
      buildTairaXorOutboundPreview({
        manifest: {},
        tairaSender: "testu1234567890abcdef",
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: "2.25",
        nonce: "7",
      }),
    ).toThrow(/deployment address/);
  });

  it("binds TAIRA message proof jobs to TRON finalize proof requests", () => {
    const binding = buildTairaXorFinalizeProofBinding({
      manifest: READY_TRON_MANIFEST,
      job: sampleTairaToTronJob(),
      messageId: HEX32_A,
      tairaSender: TAIRA_SENDER,
      tronRecipient: VALID_TRON_ADDRESS,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });

    expect(binding).toMatchObject({
      amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
      messageId: HEX32_A,
      payloadHash: HEX32_B,
      destinationBinding: {
        bindingHash: TRON_DESTINATION_BINDING.bindingHash,
        verifierAddress: VALID_TRON_ADDRESS,
      },
    });
    expect(binding.witness.publicInputs).toMatchObject({
      messageId: HEX32_A,
      targetDomain: SCCP_TRON_DOMAIN,
    });
    expect(binding.witness.bundleBytes).toBeInstanceOf(Uint8Array);
    expect((binding.witness.bundleBytes as Uint8Array).length).toBeGreaterThan(
      100,
    );
  });

  it("rejects stale or adversarial TAIRA message proof jobs", () => {
    expect(() =>
      buildTairaXorFinalizeProofBinding({
        manifest: READY_TRON_MANIFEST,
        job: sampleTairaToTronJob({
          publicInputs: {
            ...(sampleTairaToTronJob().publicInputs as Record<string, unknown>),
            messageId: HEX32_D,
          },
        }),
        messageId: HEX32_A,
        tairaSender: TAIRA_SENDER,
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/message id/);

    expect(() =>
      buildTairaXorFinalizeProofBinding({
        manifest: READY_TRON_MANIFEST,
        job: sampleTairaToTronJob({
          payloadProjection: {
            kind: "Transfer",
            value: {
              ...(
                sampleTairaToTronJob().payloadProjection as {
                  value: Record<string, unknown>;
                }
              ).value,
              amount: "200000000000000",
            },
          },
        }),
        messageId: HEX32_A,
        tairaSender: TAIRA_SENDER,
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/amount/);

    expect(() =>
      buildTairaXorFinalizeProofBinding({
        manifest: READY_TRON_MANIFEST,
        job: sampleTairaToTronJob({
          payloadProjection: {
            kind: "Transfer",
            value: {
              ...(
                sampleTairaToTronJob().payloadProjection as {
                  value: Record<string, unknown>;
                }
              ).value,
              route_id: { kind: "TextUtf8", value: "evil_route" },
            },
          },
        }),
        messageId: HEX32_A,
        tairaSender: TAIRA_SENDER,
        tronRecipient: VALID_TRON_ADDRESS,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/route id/);
  });

  it("builds TRON finalize trigger requests from completed proof packages", () => {
    const trigger = buildTairaXorFinalizeTriggerRequest({
      manifest: READY_TRON_MANIFEST,
      ownerAddress: VALID_TRON_ADDRESS,
      tronRecipient: VALID_TRON_ADDRESS,
      amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
      messageId: HEX32_A,
      proofPackage: {
        submission: {
          proofBytes: bytesToHex(groth16ProofBytes()),
          publicInputs: {
            version: 1,
            messageId: HEX32_A,
            payloadHash: HEX32_B,
            targetDomain: SCCP_TRON_DOMAIN,
            commitmentRoot: HEX32_C,
            finalityHeight: 10,
            finalityBlockHash: HEX32_F,
          },
          statementHash: HEX32_E,
        },
      },
    });

    expect(trigger).toMatchObject({
      amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
      messageId: HEX32_A,
      trigger: {
        ownerAddress: VALID_TRON_ADDRESS,
        contractAddress: VALID_TRON_ADDRESS,
        functionSelector: TAIRA_XOR_FINALIZE_FROM_TAIRA_ABI_V1,
        feeLimit: 100_000_000,
      },
    });
    expect(trigger.trigger.callData).toMatch(/^0x[0-9a-f]+$/u);
  });

  it("rejects incomplete TRON finalize proof packages", () => {
    expect(() =>
      buildTairaXorFinalizeTriggerRequest({
        manifest: READY_TRON_MANIFEST,
        ownerAddress: VALID_TRON_ADDRESS,
        tronRecipient: VALID_TRON_ADDRESS,
        amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
        messageId: HEX32_A,
        proofPackage: {
          submission: { publicInputs: {}, statementHash: HEX32_E },
        },
      }),
    ).toThrow(/proof bytes/);
  });

  it("binds TRON source proof packages to TAIRA inbound settlement", () => {
    const result = bindTronToTairaSourceProofPackage({
      manifest: READY_TRON_MANIFEST,
      proofPackage: sampleTronToTairaProofPackage(),
      txId: TRON_TX_ID,
      tronSender: VALID_TRON_ADDRESS,
      tairaRecipient: TAIRA_SENDER,
      amountDecimal: BRIDGE_AMOUNT_DECIMAL,
    });

    expect(result).toMatchObject({
      amountBaseUnits: BRIDGE_AMOUNT_BASE_UNITS,
      sourceEventDigest: HEX32_D,
      txId: TRON_TX_ID,
      settlement: {
        entrypoint: "finalize_inbound",
        route: "taira_tron_xor",
      },
    });
    expect(result.messageId).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(result.messageBundle).toMatchObject({
      commitment: {
        targetDomain: SCCP_SORA_DOMAIN,
        messageId: result.messageId,
      },
    });
  });

  it("uses manifest settlement routing without accepting caller payloads", () => {
    expect(
      buildTairaXorInboundSettlement({
        manifest: {
          settlement: {
            contractAlias: "sccp.taira_xor",
            contractAddress: "bridge@sccp",
          },
        },
        gasLimit: 1000,
      }),
    ).toEqual({
      entrypoint: "finalize_inbound",
      route: "taira_tron_xor",
      contract_address: "bridge@sccp",
      contract_alias: "sccp.taira_xor",
      gas_limit: 1000,
    });

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          (packageRecord.settlement as Record<string, unknown>).payload = {
            unsafe: true,
          };
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/settlement payload/);
  });

  it("rejects stale or adversarial TRON source proof packages", () => {
    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          (
            (packageRecord.messageBundle as Record<string, unknown>)
              .commitment as Record<string, unknown>
          ).targetDomain = SCCP_TRON_DOMAIN;
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/target TAIRA/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          (
            (
              (packageRecord.messageBundle as Record<string, unknown>)
                .payload as Record<string, unknown>
            ).value as Record<string, unknown>
          ).sender = {
            kind: "TronBase58Check",
            payload: `0x41${"11".repeat(20)}`,
          };
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/sender/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          (
            (
              (packageRecord.messageBundle as Record<string, unknown>)
                .payload as Record<string, unknown>
            ).value as Record<string, unknown>
          ).route_id = "evil_route";
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/route id/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          (
            (packageRecord.messageBundle as Record<string, unknown>)
              .commitment as Record<string, unknown>
          ).payloadHash = HEX32_A;
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/payload hash/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          packageRecord.messageId = HEX32_A;
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/message id/);

    expect(() =>
      bindTronToTairaSourceProofPackage({
        manifest: READY_TRON_MANIFEST,
        proofPackage: sampleTronToTairaProofPackage((packageRecord) => {
          packageRecord.txId = "bb".repeat(32);
        }),
        txId: TRON_TX_ID,
        tronSender: VALID_TRON_ADDRESS,
        tairaRecipient: TAIRA_SENDER,
        amountDecimal: BRIDGE_AMOUNT_DECIMAL,
      }),
    ).toThrow(/tx id/);
  });

  it("keeps route readiness false when deployment evidence is missing", () => {
    const result = resolveSccpRouteReadiness({
      connection: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
      capabilities: {
        proofSubmitPath: "/v1/bridge/proofs/submit",
        messageSubmitPath: "/v1/bridge/messages",
      },
      manifestSet: {
        manifests: [
          {
            counterpartyDomain: SCCP_TRON_DOMAIN,
            verifierTarget: "TronContract",
            productionReady: true,
            routeId: "other_route",
          },
        ],
      },
    });

    expect(result.ready).toBe(false);
    expect(result.reasons.join(" ")).toContain("taira_tron_xor");
  });

  it("stores only non-secret WalletConnect session metadata", () => {
    const snapshot = walletConnectSessionFromAddress(
      VALID_TRON_ADDRESS,
      "topic",
    );
    expect(snapshot).toMatchObject({
      topic: "topic",
      address: VALID_TRON_ADDRESS,
      chainId: TRON_MAINNET_CAIP_CHAIN_ID,
      namespace: "tron",
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/private|seed|mnemonic/iu);
  });
});

describe("SCCP proof package helpers", () => {
  it("serializes byte arrays as hex strings", () => {
    expect(serializeSccpValue(Uint8Array.from([0, 15, 255]))).toBe("0x000fff");
  });

  it("builds canonical TRON proof requests before proof bytes are available", () => {
    const result = buildTronSccpProofPackage({
      witness: {
        publicInputs: {
          version: 1,
          messageId: HEX32_A,
          payloadHash: HEX32_B,
          targetDomain: SCCP_TRON_DOMAIN,
          commitmentRoot: HEX32_C,
          finalityHeight: 10,
          finalityBlockHash: HEX32_D,
        },
        bundleBytes: [1, 2, 3],
        sourceProofBytes: [4, 5],
        statementHash: HEX32_E,
        destinationBindingHash: HEX32_A,
      },
    });

    expect(result.submission).toBeNull();
    expect(result.bridgePayload).toBeNull();
    expect(result.request).toMatchObject({
      version: 1,
      targetDomain: SCCP_TRON_DOMAIN,
      bundleBytes: "0x010203",
      sourceProofBytes: "0x0405",
    });
  });

  it("rejects stale TRON proof results before building submission payloads", () => {
    expect(() =>
      buildTronSccpProofPackage({
        witness: {
          publicInputs: {
            version: 1,
            messageId: HEX32_A,
            payloadHash: HEX32_B,
            targetDomain: SCCP_TRON_DOMAIN,
            commitmentRoot: HEX32_C,
            finalityHeight: 10,
            finalityBlockHash: HEX32_D,
          },
          bundleBytes: [1, 2, 3],
          sourceProofBytes: [4, 5],
          statementHash: HEX32_E,
          destinationBindingHash: HEX32_A,
        },
        proofResult: {
          requestHash: HEX32_B,
        } as never,
      }),
    ).toThrow(/must match the proof request/);
  });

  it("reports missing browser-safe TRON prover before proof generation", async () => {
    await expect(
      generateTronSccpProofPackage({
        witness: {
          publicInputs: {
            version: 1,
            messageId: HEX32_A,
            payloadHash: HEX32_B,
            targetDomain: SCCP_TRON_DOMAIN,
            commitmentRoot: HEX32_C,
            finalityHeight: 10,
            finalityBlockHash: HEX32_D,
          },
          bundleBytes: [1, 2, 3],
          sourceProofBytes: [4, 5],
          statementHash: HEX32_E,
          destinationBindingHash: HEX32_A,
        },
      }),
    ).rejects.toMatchObject({
      code: "ERR_SCCP_TRON_PROVER_UNAVAILABLE",
    });
  });
});
