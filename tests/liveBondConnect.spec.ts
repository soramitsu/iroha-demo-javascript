// @vitest-environment node

/**
 * Opt-in rehearsal against a LOCAL demo server already running BOND_LEDGER=taira:
 * LIVE_BOND_CONNECT=1 BOND_DEMO_URL=http://127.0.0.1:18990 npx vitest run tests/liveBondConnect.spec.ts
 * BOND_ACCESS_CODE is read only from the environment. The ephemeral investor key
 * stays in this test process. This test funds that account and submits real Taira
 * demo purchases, a repo and early repayment. BOND_CONNECT_PAIR_ONLY=1 stops after
 * pairing; the server may still run its normal wallet-funding job.
 * BOND_CONNECT_ONBOARD_ONLY=1 waits for that funding without buying bonds.
 */
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { ed25519 } from "@noble/curves/ed25519";
import { AccountAddress } from "@iroha/iroha-js";
import { describe, expect, it } from "vitest";
import {
  IrohaConnectBoundary,
  type IrohaConnectConfirmation,
  type IrohaConnectWalletContext,
} from "../electron/irohaConnectBoundary";
import {
  defaultConnectTransactionDecoder,
  reviewConnectTransactionPayload,
} from "../electron/connectTransactionReview";
import { discoverEndpointNetworkIdentity } from "../electron/networkIdentityDiscovery";
import { nodeFetch } from "../electron/nodeFetch";
import { fetchAccountAssetCollection } from "../electron/accountAssetCollection";
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

type DemoJob = {
  id: string;
  status: "running" | "done" | "failed";
  error?: string;
  txs: { signer: string; status: string; hash?: string; block?: number }[];
  result?: { loanId?: string };
};
type DemoState = {
  setupComplete: boolean;
  network: { mode: string; toriiUrl: string };
  wallet: { status: string; accountId?: string };
  assets: { EUR: { definitionId: string } };
  balances: { investor?: { EUR: string; XOR: string } };
};

const LIVE = process.env.LIVE_BOND_CONNECT === "1";
const TAIRA = "https://taira.sora.org";
const PREFIX = 369;

describe.skipIf(!LIVE)(
  "local smart-bond server and live Taira wallet (opt-in)",
  () => {
    it("pairs through the server and signs readable bond purchases, repo and repayment", async () => {
      const base = new URL(
        process.env.BOND_DEMO_URL ?? "http://127.0.0.1:18990",
      );
      // This harness mutates a throwaway world; it cannot target the public presenter.
      expect(["127.0.0.1", "localhost", "[::1]"]).toContain(base.hostname);
      const onboardOnly = process.env.BOND_CONNECT_ONBOARD_ONLY === "1";
      const pairOnly =
        process.env.BOND_CONNECT_PAIR_ONLY === "1" || onboardOnly;
      let cookie = "";
      const call = async <T>(
        method: string,
        path: string,
        body?: unknown,
      ): Promise<T> => {
        const response = await fetch(new URL(path, base), {
          method,
          headers: {
            cookie,
            ...(body === undefined
              ? {}
              : { "content-type": "application/json" }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(60_000),
        });
        const setCookie = response.headers.get("set-cookie");
        if (setCookie) cookie = setCookie.split(";")[0]!;
        if (!response.ok)
          throw new Error(`${method} ${path}: HTTP ${response.status}`);
        return (await response.json()) as T;
      };
      if (process.env.BOND_ACCESS_CODE) {
        await call("POST", "/api/session", {
          code: process.env.BOND_ACCESS_CODE,
        });
      }
      const initial = await call<DemoState>("GET", "/api/state");
      expect(initial.network.mode).toBe("taira");
      expect(initial.network.toriiUrl).toBe(TAIRA);
      if (!pairOnly) expect(initial.setupComplete).toBe(true);
      const discovery = await discoverEndpointNetworkIdentity(TAIRA, {
        fetchImpl: nodeFetch,
        timeoutMs: 20_000,
      });
      if (discovery.status !== "verified") throw new Error(discovery.detail);
      const native = createRequire(import.meta.url)(
        resolve(
          "node_modules/.cache/iroha-sdk-compat/active/native/iroha_js_host.node",
        ),
      ) as {
        noritoDecodeInstructionBoxArchive(
          bytes: Uint8Array,
          prefix: number,
        ): string;
      };
      const walletKey = ed25519.utils.randomPrivateKey();
      const account = AccountAddress.fromAccount({
        publicKey: ed25519.getPublicKey(walletKey),
        algorithm: "ed25519",
      }).toI105(PREFIX);
      const context: IrohaConnectWalletContext = {
        toriiUrl: TAIRA,
        chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
        networkPrefix: PREFIX,
        networkId: discovery.identity.networkId,
        accountId: account,
      };
      const confirmations: IrohaConnectConfirmation[] = [];
      const errors: unknown[] = [];
      const boundary = new IrohaConnectBoundary({
        assertContext: async (input) => {
          expect(input).toEqual(context);
          return { ...input };
        },
        authorize: async (confirmation) => {
          confirmations.push(confirmation);
          if (confirmation.kind === "sign_request_tx") {
            expect(confirmation.review.authority).toBe(account);
            expect(confirmation.review.networkId).toBe(context.networkId);
            expect(confirmation.review.warnings).toEqual([]);
            expect(
              confirmation.review.instructions.every(
                (instruction) =>
                  instruction.kind !== "unknown" &&
                  instruction.kind !== "undecoded",
              ),
            ).toBe(true);
          }
          return true; // Explicitly opted-in headless test only; product still prompts.
        },
        reviewTransaction: (reviewContext, payloadBytes) =>
          reviewConnectTransactionPayload({
            payloadBytes,
            expectedAuthority: reviewContext.accountId,
            expectedNetworkId: reviewContext.networkId,
            networkPrefix: PREFIX,
            decoder: {
              inspectPayload: defaultConnectTransactionDecoder().inspectPayload,
              decodeInstructionArchive: (archive, prefix) =>
                native.noritoDecodeInstructionBoxArchive(archive, prefix),
            },
          }),
        sign: async (_context, message) => {
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
      await call("POST", "/api/admin/signing", { mode: "connect" });
      await call("POST", "/api/wallet/disconnect");
      const pairing = await call<{ status: string; uri: string }>(
        "POST",
        "/api/wallet/connect",
      );
      expect(pairing.status).toBe("pairing");
      const parsed = parseIrohaConnectUri(pairing.uri);
      expect(parsed.networkId).toBe(context.networkId);
      const socket = new WebSocket(buildIrohaConnectWebSocketUrl(parsed), [
        buildIrohaConnectTokenProtocol(parsed.token),
      ]);
      socket.binaryType = "arraybuffer";
      let sessionToken = "";
      let queue = Promise.resolve();
      socket.addEventListener("message", (event) => {
        queue = queue
          .then(async () => {
            const bytes =
              event.data instanceof Blob
                ? new Uint8Array(await event.data.arrayBuffer())
                : new Uint8Array(event.data as ArrayBuffer);
            const frame = decodeConnectFrame(bytes);
            if (!sessionToken) {
              if (frame.control?.type === "server_event") return;
              if (frame.control?.type !== "open")
                throw new Error("Expected relay Open");
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
              socket.send(base64ToBytes(approved.frameBase64));
              return;
            }
            const processed = boundary.processFrame({
              sessionToken,
              frameBase64: bytesToBase64(bytes),
            });
            if (processed.kind === "response")
              socket.send(base64ToBytes(processed.frameBase64));
            if (processed.kind === "request") {
              const result = await boundary.approveRequest({
                sessionToken,
                requestToken: processed.requestToken,
              });
              socket.send(base64ToBytes(result.frameBase64));
            }
          })
          .catch((error) => {
            errors.push(error);
          });
      });
      const waitUntil = async (
        check: () => Promise<boolean>,
        label: string,
        timeoutMs = 180_000,
      ) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          if (errors.length) throw errors[0];
          if (await check()) return;
          await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
        }
        throw new Error(`Timed out: ${label}`);
      };
      const waitJob = async (job: DemoJob): Promise<DemoJob> => {
        let current = job;
        await waitUntil(
          async () => {
            current = await call<DemoJob>("GET", `/api/jobs/${job.id}`);
            if (current.status === "failed")
              throw new Error(current.error ?? "Demo job failed");
            return current.status === "done";
          },
          "demo job",
          300_000,
        );
        expect(current.txs.every((tx) => tx.status === "applied")).toBe(true);
        expect(
          current.txs.some(
            (tx) => tx.signer === "wallet" && tx.hash && tx.block,
          ),
        ).toBe(true);
        return current;
      };
      try {
        await waitUntil(async () => {
          const state = await call<DemoState>("GET", "/api/state");
          return (
            state.wallet.status === "connected" &&
            state.wallet.accountId === account
          );
        }, "wallet pairing");
        console.info(
          "[live bond] production wallet boundary paired with local server over Taira relay",
        );
        if (pairOnly && !onboardOnly) return;
        await waitUntil(
          async () => {
            const state = await call<DemoState>("GET", "/api/state");
            if (Number(state.balances.investor?.EUR ?? 0) <= 0) return false;
            const page = await fetchAccountAssetCollection({
              toriiUrl: TAIRA,
              accountId: account,
              networkPrefix: PREFIX,
              limit: 50,
            });
            return (
              page.items.some(
                (asset) =>
                  asset.scope === "global" &&
                  asset.asset_definition_id ===
                    initial.assets.EUR.definitionId &&
                  Number(asset.quantity) > 0,
              ) && Number(state.balances.investor?.EUR ?? 0) > 0
            );
          },
          "wallet funding",
          300_000,
        );
        if (onboardOnly) {
          console.info(
            "[live bond] wallet onboarding confirmed with on-chain EUR and demo balance",
          );
          return;
        }
        await waitJob(
          await call<DemoJob>("POST", "/api/trades", {
            bondId: "abc-tourism-2030",
            units: 2,
            asset: "EUR",
          }),
        );
        await waitJob(
          await call<DemoJob>("POST", "/api/trades", {
            bondId: "garantiq-2029",
            units: 1,
            asset: "EUR",
          }),
        );
        const loan = await waitJob(
          await call<DemoJob>("POST", "/api/loans", {
            bondId: "abc-tourism-2030",
            units: 2,
            ltvPct: 60,
            termMonths: 6,
          }),
        );
        expect(loan.result?.loanId).toBeTruthy();
        await waitJob(
          await call<DemoJob>(
            "POST",
            `/api/loans/${loan.result!.loanId}/repay`,
          ),
        );
        const reviews = confirmations.flatMap((confirmation) =>
          confirmation.kind === "sign_request_tx"
            ? confirmation.review.instructions
            : [],
        );
        expect(
          reviews.some(
            (instruction) =>
              instruction.kind === "settlement_atomic" &&
              instruction.fields.some((entry) =>
                entry.label.startsWith("Escrow leg"),
              ),
          ),
        ).toBe(true);
        expect(
          reviews.some((instruction) => instruction.title === "Initiate repo"),
        ).toBe(true);
        expect(
          reviews.some((instruction) => instruction.title === "Reverse repo"),
        ).toBe(true);
        expect(errors).toEqual([]);
        console.info(
          `[live bond] ${reviews.length} decoded instructions approved; purchases, repo and early repayment applied`,
        );
      } finally {
        try {
          await call("POST", "/api/wallet/disconnect");
        } finally {
          socket.close();
          await queue;
          walletKey.fill(0);
        }
      }
    }, 1_200_000);
  },
);
