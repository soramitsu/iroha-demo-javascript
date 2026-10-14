// @vitest-environment node

/**
 * Opt-in live rehearsal of the Palmatrix smart-bond demo with this wallet's production
 * IrohaConnect boundary standing in for the presenter's approvals:
 *
 *   PALMATRIX_URL=https://palmatrix.soramitsu.io PALMATRIX_ACCESS_CODE=… \
 *   PALMATRIX_STEPS=pair,buy,subscribe,loan,repay npx vitest run tests/palmatrixRehearsal.spec.ts
 *
 * The demo site opens an IrohaConnect app session on its Torii relay; this test pairs with a
 * fresh Ed25519 investor account, lets the site onboard (fund) it, then drives each step through
 * the site's API. Every signing request is decoded by the wallet's transaction review, checked
 * against the paired account and network, logged as the approval screen would show it, and only
 * then signed over the reviewed payload hash. Transactions are submitted to the live ledger by
 * the site. The access code is read from the environment and never logged.
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { AccountAddress } from "@iroha/iroha-js";
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
import { TAIRA_CHAIN_ID } from "@/utils/firstReleaseNetworkIdentity";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  decodeConnectFrame,
} from "@/utils/soraswapConnectWire";

const BASE = (process.env.PALMATRIX_URL ?? "").replace(/\/$/u, "");
const CODE = process.env.PALMATRIX_ACCESS_CODE ?? "";
const STEPS = new Set(
  (process.env.PALMATRIX_STEPS ?? "pair")
    .split(",")
    .map((step) => step.trim())
    .filter(Boolean),
);

const native = createRequire(import.meta.url)(
  resolve(
    "node_modules/.cache/iroha-sdk-compat/active/native/iroha_js_host.node",
  ),
) as {
  noritoDecodeInstructionBoxArchive(bytes: Uint8Array, prefix: number): string;
};

type Json = Record<string, any>;

let cookie = "";
const api = async <T = Json>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      "x-demo-role": "investor",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0]!;
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
};

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

const waitFor = async <T>(
  label: string,
  probe: () => Promise<T | undefined>,
  timeoutMs: number,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(2_000);
  }
};

const waitJob = async (job: Json, label: string): Promise<Json> => {
  const done = await waitFor(
    label,
    async () => {
      const current = await api(`GET`, `/api/jobs/${job.id}`);
      return current.status === "running" ? undefined : current;
    },
    15 * 60_000,
  );
  const txs = (done.txs ?? [])
    .map((tx: Json) => `${tx.key}:${tx.status}${tx.hash ? `@${String(tx.hash).slice(0, 12)}` : ""}`)
    .join(" ");
  console.info(`[rehearsal] ${done.status === "done" ? "ok  " : "FAIL"} ${label} ${txs}`);
  if (done.status !== "done") throw new Error(`${label}: ${done.error ?? done.status}`);
  return done;
};

const readMessageBytes = async (data: unknown): Promise<Uint8Array> => {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data instanceof Blob) return new Uint8Array(await data.arrayBuffer());
  throw new Error("unexpected relay message type");
};

describe.skipIf(!BASE)("Palmatrix live rehearsal (opt-in)", () => {
  it(
    "pairs the investor wallet and approves each demo step through the wallet review",
    async () => {
      if (CODE) await api("POST", "/api/session", { code: CODE });
      let state = await api("GET", "/api/state");
      expect(state.network.mode).toBe("taira");
      const toriiUrl: string = state.network.toriiUrl;
      // The site reports Taira's network id in `chainId`; the wallet pins the real chain id.
      const chainId = process.env.PALMATRIX_CHAIN_ID ?? TAIRA_CHAIN_ID;
      const discovery = await discoverEndpointNetworkIdentity(toriiUrl, {
        fetchImpl: nodeFetch,
        timeoutMs: 20_000,
      });
      if (discovery.status !== "verified") throw new Error(discovery.detail);
      const networkId = discovery.identity.networkId;
      const networkPrefix = discovery.identity.networkPrefix;

      // Fresh investor key for this rehearsal; the site onboards (funds) the account.
      const walletKey = ed25519.utils.randomPrivateKey();
      const account = AccountAddress.fromAccount({
        publicKey: ed25519.getPublicKey(walletKey),
        algorithm: "ed25519",
      }).toI105(networkPrefix);
      console.info(`[rehearsal] investor wallet ${account}`);

      const confirmations: IrohaConnectConfirmation[] = [];
      const context: IrohaConnectWalletContext = {
        toriiUrl,
        chainId,
        networkPrefix,
        networkId,
        accountId: account,
      };
      const boundary = new IrohaConnectBoundary({
        assertContext: async (input) => ({ ...input }),
        authorize: async (confirmation) => {
          confirmations.push(confirmation);
          if (confirmation.kind === "sign_request_tx") {
            const review = confirmation.review;
            // Refuse anything not for this account and network, like the wallet's dialog.
            if (review.authority !== account || review.networkId !== networkId) return false;
            console.info(
              `[rehearsal] approval: ${review.instructions.length} instruction(s), payload ${review.payloadHashHex.slice(0, 16)}…`,
            );
            for (const instruction of review.instructions) {
              const fields = instruction.fields.map((f) => `${f.label}=${f.value}`).join("; ");
              console.info(`[rehearsal]   #${instruction.index} ${instruction.kind} ${instruction.title}${fields ? ` — ${fields}` : ""}${instruction.warning ? ` [warning: ${instruction.warning}]` : ""}`);
            }
            for (const warning of review.warnings) console.info(`[rehearsal]   warning: ${warning}`);
          }
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

      // Investor signing goes through the wallet for the whole rehearsal.
      await api("POST", "/api/admin/signing", { mode: "connect" });
      if (state.wallet?.status !== "disconnected") await api("POST", "/api/wallet/disconnect");
      const pairing = await api("POST", "/api/wallet/connect");
      const uri: string = pairing.uri ?? (await api("GET", "/api/state")).wallet.uri;
      expect(uri).toMatch(/^iroha:\/\/connect\?/u);
      const parsed = parseIrohaConnectUri(uri);
      expect(parsed.networkId).toBe(networkId);

      const walletSocket = new WebSocket(buildIrohaConnectWebSocketUrl(parsed), [
        buildIrohaConnectTokenProtocol(parsed.token),
      ]);
      walletSocket.binaryType = "arraybuffer";
      let sessionToken = "";
      const walletErrors: unknown[] = [];
      const queue: Promise<void>[] = [];
      walletSocket.addEventListener("message", (event) => {
        queue.push(
          (async () => {
            const bytes = await readMessageBytes(event.data);
            const frame = decodeConnectFrame(bytes);
            if (!sessionToken) {
              if (frame.control?.type === "server_event") return;
              if (frame.control?.type !== "open") throw new Error(`expected Open, got ${frame.kind}`);
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
            const processed = boundary.processFrame({ sessionToken, frameBase64: bytesToBase64(bytes) });
            if (processed.kind === "response") {
              walletSocket.send(base64ToBytes(processed.frameBase64));
            } else if (processed.kind === "request") {
              const result = await boundary.approveRequest({ sessionToken, requestToken: processed.requestToken });
              walletSocket.send(base64ToBytes(result.frameBase64));
            }
          })().catch((error) => {
            console.info(`[rehearsal] wallet error ${String(error)}`);
            walletErrors.push(error);
          }),
        );
      });
      await new Promise<void>((done, fail) => {
        walletSocket.addEventListener("open", () => done(), { once: true });
        walletSocket.addEventListener("error", () => fail(new Error("wallet relay socket failed")), { once: true });
      });

      try {
        // 1. Pairing and onboarding (XOR for fees from the faucet, EUR from the broker-bank).
        state = await waitFor(
          "the site to see the paired wallet",
          async () => {
            const s = await api("GET", "/api/state");
            return s.wallet?.status === "connected" && s.wallet.accountId === account ? s : undefined;
          },
          120_000,
        );
        console.info(`[rehearsal] ok   paired as ${state.wallet.walletName}`);
        state = await waitFor(
          "onboarding funds",
          async () => {
            const s = await api("GET", "/api/state");
            const balance = s.balances?.investor;
            const investor = s.personas.find((p: Json) => p.id === "investor");
            return investor?.accountId === account && BigInt(balance?.EUR ?? "0") > 0n ? s : undefined;
          },
          10 * 60_000,
        );
        console.info(
          `[rehearsal] ok   onboarded: ${state.balances.investor.EUR} EUR cents, ${state.balances.investor.XOR} XOR (base units)`,
        );

        const approvalsBefore = () => confirmations.filter((c) => c.kind === "sign_request_tx").length;

        // 2. DEMO 1 purchase: ABC Tourism is past its minimum raise, so it settles immediately.
        if (STEPS.has("buy")) {
          const before = approvalsBefore();
          await waitJob(await api("POST", "/api/trades", { bondId: "abc-tourism-2030", units: 20, asset: "EUR" }), "buy 20 ABCT30 with EUR (wallet-signed)");
          expect(approvalsBefore()).toBeGreaterThan(before);
        }
        // 3. Conditional subscription: GarantIQ is below its minimum raise.
        if (STEPS.has("subscribe")) {
          const before = approvalsBefore();
          await waitJob(await api("POST", "/api/trades", { bondId: "garantiq-2029", units: 20, asset: "EUR" }), "subscribe 20 GRQ29 (conditional, wallet-signed)");
          expect(approvalsBefore()).toBeGreaterThan(before);
        }
        // 4. Repo loan against the ABC Tourism units, then early repayment.
        let loanId: string | undefined;
        if (STEPS.has("loan")) {
          const before = approvalsBefore();
          const loan = await waitJob(await api("POST", "/api/loans", { bondId: "abc-tourism-2030", units: 20, ltvPct: 60, termMonths: 6 }), "repo loan 20 ABCT30 at 60% (wallet-signed)");
          loanId = loan.result?.loanId;
          expect(approvalsBefore()).toBeGreaterThan(before);
        }
        if (STEPS.has("repay") && loanId) {
          const before = approvalsBefore();
          await waitJob(await api("POST", `/api/loans/${loanId}/repay`), "early repayment (wallet-signed)");
          expect(approvalsBefore()).toBeGreaterThan(before);
        }
        expect(walletErrors).toEqual([]);
      } finally {
        await api("POST", "/api/wallet/disconnect").catch(() => undefined);
        walletSocket.close();
        await Promise.allSettled(queue);
      }
    },
    45 * 60_000,
  );
});
