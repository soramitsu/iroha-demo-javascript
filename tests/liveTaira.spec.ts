// @vitest-environment node

/**
 * Opt-in live checks against the public TAIRA endpoint:
 *
 *   LIVE_TAIRA=1 npx vitest run tests/liveTaira.spec.ts
 *
 * Read-only GETs plus one ephemeral IrohaConnect relay session. Nothing is
 * submitted to the chain: the dApp-side signature is only finalized locally
 * with the native `finalizeSignedTransaction`. Set LIVE_TAIRA_DEBUG=1 to log
 * relay frames seen by the wallet side.
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ed25519, x25519 } from "@noble/curves/ed25519";
import {
  AccountAddress,
  NetworkId,
  buildTransactionPayload,
  buildTransferAssetInstruction,
} from "@iroha/iroha-js";
import {
  createConnectAppSession,
  createConnectSessionPreview,
  registerConnectSession,
} from "@iroha/iroha-js/connect-browser";
import { inspectEndpoint } from "../electron/endpointInspector";
import { discoverEndpointNetworkIdentity } from "../electron/networkIdentityDiscovery";
import { nodeFetch } from "../electron/nodeFetch";
import {
  IrohaConnectBoundary,
  type IrohaConnectConfirmation,
  type IrohaConnectWalletContext,
} from "../electron/irohaConnectBoundary";
import {
  defaultConnectTransactionDecoder,
  reviewConnectTransactionPayload,
} from "../electron/connectTransactionReview";
import {
  buildIrohaConnectTokenProtocol,
  buildIrohaConnectWebSocketUrl,
  parseIrohaConnectUri,
} from "@/utils/irohaConnect";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  decodeConnectFrame,
} from "@/utils/soraswapConnectWire";
import type { NetworkIdentityPin } from "@/utils/networkIdentity";
import { withRelayFixedArrayLayout } from "./helpers/connectRelayFixedArrays";

const LIVE = process.env.LIVE_TAIRA === "1";
const TAIRA = "https://taira.sora.org";
const TAIRA_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
const PREFIX = 369;
const XOR = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";

const native = createRequire(import.meta.url)(
  resolve(
    "node_modules/.cache/iroha-sdk-compat/active/native/iroha_js_host.node",
  ),
) as {
  noritoDecodeInstructionBoxArchive(bytes: Uint8Array, prefix: number): string;
  finalizeSignedTransaction(input: Record<string, unknown>): {
    signedTransaction: Uint8Array;
    hash: Uint8Array;
  };
};

const memoryPins = () => {
  const pins = new Map<string, NetworkIdentityPin>();
  return {
    read: async (toriiUrl: string) => pins.get(toriiUrl) ?? null,
    pinFirstUse: async (
      toriiUrl: string,
      identity: { networkId: string; networkPrefix: number },
    ) => {
      const pin: NetworkIdentityPin = {
        schema: "iroha.wallet.network-identity-pin.v1",
        toriiUrl,
        networkId: identity.networkId,
        networkPrefix: identity.networkPrefix,
        confirmedAtMs: Date.now(),
        confirmation: "first-use",
      };
      pins.set(toriiUrl, pins.get(toriiUrl) ?? pin);
      return pins.get(toriiUrl)!;
    },
  };
};

const readMessageBytes = async (data: unknown): Promise<Uint8Array> => {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  throw new Error("unexpected relay message type");
};

describe.skipIf(!LIVE)("live TAIRA (opt-in)", () => {
  it("derives an agreeing network identity and classifies TAIRA read-write", async () => {
    const discovery = await discoverEndpointNetworkIdentity(TAIRA, {
      fetchImpl: nodeFetch,
      timeoutMs: 20_000,
    });
    expect(discovery.status).toBe("verified");
    const inspection = await inspectEndpoint(
      { toriiUrl: TAIRA, chainId: TAIRA_CHAIN_ID, networkPrefix: PREFIX },
      { identityPins: memoryPins(), fetchImpl: nodeFetch, timeoutMs: 30_000 },
    );
    console.info(
      `[live] ${TAIRA} network ${inspection.observed?.networkId} -> ${inspection.identityStatus}/${inspection.accessMode}`,
    );
    expect(inspection.identityStatus).toBe("matched");
    expect(inspection.accessMode).toBe("read-write");
    expect(inspection.observed?.networkId).toBe(discovery.identity?.networkId);
    expect(inspection.features.irohaConnectSessions.supported).toBe(true);
    expect(inspection.features.assetTransfers.supported).toBe(true);
    expect(inspection.features.faucetClaim.supported).toBe(true);
  }, 60_000);

  it("pairs an SDK app session over the live relay and signs a reviewed payload hash", async () => {
    const discovery = await discoverEndpointNetworkIdentity(TAIRA, {
      fetchImpl: nodeFetch,
      timeoutMs: 20_000,
    });
    if (discovery.status !== "verified") throw new Error(discovery.detail);
    const networkIdLiteral = discovery.identity.networkId;
    const networkId = NetworkId.parse(networkIdLiteral);

    // Wallet account (never funded or submitted on chain).
    const walletKey = ed25519.utils.randomPrivateKey();
    const account = AccountAddress.fromAccount({
      publicKey: ed25519.getPublicKey(walletKey),
      algorithm: "ed25519",
    }).toI105(PREFIX);
    const recipient = AccountAddress.fromAccount({
      publicKey: ed25519.getPublicKey(ed25519.utils.randomPrivateKey()),
      algorithm: "ed25519",
    }).toI105(PREFIX);

    // dApp side (Node, @iroha/iroha-js): create and register the session.
    const appPrivateKey = x25519.utils.randomPrivateKey();
    const preview = createConnectSessionPreview({
      networkId,
      node: TAIRA,
      appKeyPair: {
        privateKey: appPrivateKey,
        publicKey: x25519.getPublicKey(appPrivateKey),
      },
    });
    const registered = await registerConnectSession(TAIRA, preview, {
      node: TAIRA,
    });
    const parsed = parseIrohaConnectUri(registered.wallet_uri);
    expect(parsed.networkId).toBe(networkIdLiteral);

    // Wallet side: the production boundary with a test signer.
    const confirmations: IrohaConnectConfirmation[] = [];
    const context: IrohaConnectWalletContext = {
      toriiUrl: TAIRA,
      chainId: TAIRA_CHAIN_ID,
      networkPrefix: PREFIX,
      networkId: networkIdLiteral,
      accountId: account,
    };
    const boundary = new IrohaConnectBoundary({
      assertContext: async (input) => ({ ...input }),
      authorize: async (confirmation) => {
        confirmations.push(confirmation);
        return true;
      },
      reviewTransaction: (reviewContext, payloadBytes) =>
        reviewConnectTransactionPayload({
          payloadBytes,
          expectedAuthority: reviewContext.accountId,
          expectedNetworkId: reviewContext.networkId,
          networkPrefix: reviewContext.networkPrefix,
          decoder: {
            inspectPayload: defaultConnectTransactionDecoder().inspectPayload,
            decodeInstructionArchive: (archive, prefix) =>
              native.noritoDecodeInstructionBoxArchive(archive, prefix),
          },
        }),
      sign: async (_signingContext, message) => {
        const signature = ed25519.sign(message, walletKey);
        return {
          algorithmCode: 0,
          algorithmLabel: "Ed25519",
          signatureHex: bytesToHex(signature),
          signatureBase64: bytesToBase64(signature),
        };
      },
    });
    boundary.setContext(context);

    const walletSocket = new WebSocket(buildIrohaConnectWebSocketUrl(parsed), [
      buildIrohaConnectTokenProtocol(parsed.token),
    ]);
    walletSocket.binaryType = "arraybuffer";
    const debug = process.env.LIVE_TAIRA_DEBUG === "1";
    walletSocket.addEventListener("close", (event) => {
      if (debug)
        console.info(
          `[live] wallet socket closed ${event.code} ${event.reason}`,
        );
    });
    let sessionToken = "";
    const walletErrors: unknown[] = [];
    const queue: Promise<void>[] = [];
    walletSocket.addEventListener("message", (event) => {
      queue.push(
        (async () => {
          const bytes = await readMessageBytes(event.data);
          const frame = decodeConnectFrame(bytes);
          if (debug) {
            console.info(
              `[live] wallet <- ${frame.kind} ${frame.control?.type ?? ""} seq=${frame.seq}`,
            );
          }
          if (!sessionToken) {
            if (frame.control?.type === "server_event") return;
            if (frame.control?.type !== "open") {
              throw new Error(`expected Open, got ${frame.kind}`);
            }
            const prepared = await boundary.prepareSession({
              context,
              sid: parsed.sid,
              appPublicKeyHex: frame.control.appPublicKeyHex,
              nonceBase64Url: parsed.nonceBase64Url,
              relayToken: parsed.relayToken,
              requestedNetworkId: frame.control.constraints.networkId,
              permissions: frame.control.permissions,
            });
            const approved = await boundary.approveSession(prepared);
            sessionToken = approved.sessionToken;
            walletSocket.send(base64ToBytes(approved.frameBase64));
            return;
          }
          const processed = boundary.processFrame({
            sessionToken,
            frameBase64: bytesToBase64(bytes),
          });
          if (processed.kind === "response") {
            walletSocket.send(base64ToBytes(processed.frameBase64));
          } else if (processed.kind === "request") {
            const result = await boundary.approveRequest({
              sessionToken,
              requestToken: processed.requestToken,
            });
            walletSocket.send(base64ToBytes(result.frameBase64));
          }
        })().catch((error) => {
          if (debug) console.info(`[live] wallet error ${String(error)}`);
          walletErrors.push(error);
        }),
      );
    });
    await new Promise<void>((resolveOpen, rejectOpen) => {
      walletSocket.addEventListener("open", () => resolveOpen(), {
        once: true,
      });
      walletSocket.addEventListener(
        "error",
        () => rejectOpen(new Error("wallet relay socket failed")),
        { once: true },
      );
    });

    const app = createConnectAppSession({
      baseUrl: TAIRA,
      preview,
      session: registered,
      permissions: {
        methods: ["sign_transaction", "sign_raw"],
        events: [],
        resources: ["iroha:torii:canonical-request:v1"],
      },
      // The linked SDK still writes raw [u8; 32] frame arrays, which the live
      // relay rejects; the shim applies the relay's element-framed layout.
      webSocketImpl: withRelayFixedArrayLayout(WebSocket),
    });
    try {
      const approval = await app.waitForApproval();
      expect(approval.accountId).toBe(account);

      const draft = buildTransactionPayload({
        networkId,
        authority: account,
        instructions: [
          buildTransferAssetInstruction({
            sourceAssetHoldingId: `${XOR}#${account}`,
            quantity: "1.5",
            destinationAccountId: recipient,
          }),
        ],
        feePayment: { payer: "authority", chargeLimits: [], gasLimit: null },
        ttlMs: 60_000,
      });
      const signature = await app.signTransaction(draft.payloadBytes);
      expect(walletErrors).toEqual([]);

      const txConfirmation = confirmations.find(
        (entry) => entry.kind === "sign_request_tx",
      );
      expect(txConfirmation?.kind).toBe("sign_request_tx");
      if (txConfirmation?.kind === "sign_request_tx") {
        expect(txConfirmation.review.payloadHashHex).toBe(
          draft.payloadHash.toString("hex"),
        );
        expect(txConfirmation.review.instructions[0]).toMatchObject({
          kind: "transfer",
          fields: expect.arrayContaining([
            { label: "Amount", value: "1.5" },
            { label: "To", value: recipient },
          ]),
        });
      }

      // dApp finalizes locally; the signed transaction is NOT submitted.
      const finalized = native.finalizeSignedTransaction({
        authority: account,
        networkId: networkId.toBytes(),
        payloadBytes: draft.payloadBytes,
        payloadHashHex: draft.payloadHash.toString("hex"),
        publicKey: ed25519.getPublicKey(walletKey),
        signature,
      });
      console.info(
        `[live] relay session ${parsed.sid.slice(0, 8)}… signed tx ${Buffer.from(finalized.hash).toString("hex")} (not submitted)`,
      );
      expect(finalized.hash).toHaveLength(32);
    } finally {
      app.close("live test complete");
      walletSocket.close();
      await Promise.allSettled(queue);
    }
  }, 120_000);
});
