// @vitest-environment node

/**
 * Opt-in live rehearsal of the Palmatrix smart-bond demo with this wallet's production
 * IrohaConnect boundary standing in for the presenter's approvals:
 *
 *   PALMATRIX_URL=https://palmatrix.soramitsu.io PALMATRIX_ACCESS_CODE=… \
 *   PALMATRIX_STEPS=pair,buy,subscribe,loan,repay,accelerated,claim,redeem npx vitest run tests/palmatrixRehearsal.spec.ts
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
  palmatrixPaymentCents,
  palmatrixRehearsalSteps,
} from "./helpers/palmatrixRehearsal";
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  decodeConnectFrame,
} from "@/utils/soraswapConnectWire";

const BASE = (process.env.PALMATRIX_URL ?? "").replace(/\/$/u, "");
const CODE = process.env.PALMATRIX_ACCESS_CODE ?? "";
const STEPS = palmatrixRehearsalSteps(process.env.PALMATRIX_STEPS ?? "pair");

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
  role = "investor",
): Promise<T> => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    signal: AbortSignal.timeout(60_000),
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      "x-demo-role": role,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0]!;
  const text = await response.text();
  if (!response.ok)
    throw new Error(
      `${method} ${path} -> ${response.status} ${text.slice(0, 300)}`,
    );
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
    if (Date.now() > deadline)
      throw new Error(`timed out waiting for ${label}`);
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
    .map(
      (tx: Json) =>
        `${tx.key}:${tx.status}${tx.hash ? `@${String(tx.hash).slice(0, 12)}` : ""}`,
    )
    .join(" ");
  console.info(
    `[rehearsal] ${done.status === "done" ? "ok  " : "FAIL"} ${label} ${txs}`,
  );
  if (done.status !== "done")
    throw new Error(`${label}: ${done.error ?? done.status}`);
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
            if (review.authority !== account || review.networkId !== networkId)
              return false;
            if (
              review.instructions.some(
                (instruction) =>
                  instruction.kind === "unknown" ||
                  instruction.kind === "undecoded",
              )
            )
              return false;
            console.info(
              `[rehearsal] approval: ${review.instructions.length} instruction(s), payload ${review.payloadHashHex.slice(0, 16)}…`,
            );
            for (const instruction of review.instructions) {
              const fields = instruction.fields
                .map((f) => `${f.label}=${f.value}`)
                .join("; ");
              console.info(
                `[rehearsal]   #${instruction.index} ${instruction.kind} ${instruction.title}${fields ? ` — ${fields}` : ""}${instruction.warning ? ` [warning: ${instruction.warning}]` : ""}`,
              );
            }
            for (const warning of review.warnings)
              console.info(`[rehearsal]   warning: ${warning}`);
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
      if (state.wallet?.status !== "disconnected")
        await api("POST", "/api/wallet/disconnect");
      const pairing = await api("POST", "/api/wallet/connect");
      const uri: string =
        pairing.uri ?? (await api("GET", "/api/state")).wallet.uri;
      // Pairing URIs contain relay credentials; never give one to an assertion
      // formatter (which would print the received value on failure).
      if (typeof uri !== "string" || !/^iroha:\/\/connect\?/u.test(uri)) {
        throw new Error("The demo did not return a valid wallet pairing URI");
      }
      let parsed: ReturnType<typeof parseIrohaConnectUri>;
      try {
        parsed = parseIrohaConnectUri(uri);
      } catch {
        throw new Error("The demo returned an invalid wallet pairing URI");
      }
      expect(parsed.networkId).toBe(networkId);

      const walletSocket = new WebSocket(
        buildIrohaConnectWebSocketUrl(parsed),
        [buildIrohaConnectTokenProtocol(parsed.token)],
      );
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
              if (frame.control?.type !== "open")
                throw new Error(`expected Open, got ${frame.kind}`);
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
            console.info(`[rehearsal] wallet error ${String(error)}`);
            walletErrors.push(error);
          }),
        );
      });
      await new Promise<void>((done, fail) => {
        walletSocket.addEventListener("open", () => done(), { once: true });
        walletSocket.addEventListener(
          "error",
          () => fail(new Error("wallet relay socket failed")),
          { once: true },
        );
      });

      try {
        // 1. Pairing and onboarding (XOR for fees from the faucet, EUR from the broker-bank).
        state = await waitFor(
          "the site to see the paired wallet",
          async () => {
            const s = await api("GET", "/api/state");
            return s.wallet?.status === "connected" &&
              s.wallet.accountId === account
              ? s
              : undefined;
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
            return investor?.accountId === account &&
              BigInt(balance?.EUR ?? "0") > 0n
              ? s
              : undefined;
          },
          10 * 60_000,
        );
        console.info(
          `[rehearsal] ok   onboarded: ${state.balances.investor.EUR} EUR cents, ${state.balances.investor.XOR} XOR (base units)`,
        );

        const approvalsBefore = () =>
          confirmations.filter((c) => c.kind === "sign_request_tx").length;

        // 2. DEMO 1 purchase: ABC Tourism is past its minimum raise, so it settles immediately.
        if (STEPS.has("buy")) {
          const before = approvalsBefore();
          await waitJob(
            await api("POST", "/api/trades", {
              bondId: "abc-tourism-2030",
              units: 20,
              asset: "EUR",
            }),
            "buy 20 ABCT30 with EUR (wallet-signed)",
          );
          expect(approvalsBefore()).toBeGreaterThan(before);
        }
        // 3. Conditional subscription: GarantIQ is below its minimum raise.
        if (STEPS.has("subscribe")) {
          const before = approvalsBefore();
          await waitJob(
            await api("POST", "/api/trades", {
              bondId: "garantiq-2029",
              units: 20,
              asset: "EUR",
            }),
            "subscribe 20 GRQ29 (conditional, wallet-signed)",
          );
          expect(approvalsBefore()).toBeGreaterThan(before);
        }
        // 4. Repo loan against the ABC Tourism units, then early repayment.
        let loanId: string | undefined;
        if (STEPS.has("loan")) {
          const before = approvalsBefore();
          const loan = await waitJob(
            await api("POST", "/api/loans", {
              bondId: "abc-tourism-2030",
              units: 20,
              ltvPct: 60,
              termMonths: 6,
            }),
            "repo loan 20 ABCT30 at 60% (wallet-signed)",
          );
          loanId = loan.result?.loanId;
          expect(loanId).toEqual(expect.any(String));
          expect(loanId).not.toBe("");
          expect(approvalsBefore()).toBeGreaterThan(before);
        }
        if (STEPS.has("repay")) {
          if (!loanId)
            throw new Error("The loan step did not return a loan ID");
          const before = approvalsBefore();
          await waitJob(
            await api("POST", `/api/loans/${loanId}/repay`),
            "early repayment (wallet-signed)",
          );
          expect(approvalsBefore()).toBeGreaterThan(before);
        }

        // 5. A fresh accelerated monthly bond. Its first, past-due coupon has
        // no eligible holders; coupon 2 and redemption pay the new investor.
        if (STEPS.has("accelerated")) {
          const leadSeconds = Number(
            process.env.PALMATRIX_LEAD_SECONDS ?? "600",
          );
          if (
            !Number.isSafeInteger(leadSeconds) ||
            leadSeconds < 60 ||
            leadSeconds > 3600
          ) {
            throw new Error(
              "PALMATRIX_LEAD_SECONDS must be an integer from 60 to 3600",
            );
          }
          state = await api("GET", "/api/state");
          const suffix = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].find(
            (letter) =>
              !state.bonds.some((bond: Json) =>
                String(bond.terms.code).startsWith(`WR${letter}`),
              ),
          );
          if (!suffix)
            throw new Error(
              "No unused wallet rehearsal bond code remains; reset the demo world",
            );
          const now = new Date();
          const issued = await waitJob(
            await api("POST", "/api/bonds", {
              contact: {
                email: "rehearsal@example.com",
                website: "https://example.com",
                fullName: "Wallet Rehearsal",
                social: "",
              },
              company: {
                name: `Wallet Rehearsal ${suffix} d.o.o.`,
                sector: "energy",
                country: "SI",
                city: "Kranj",
                founded: 2014,
                purpose:
                  "Accelerated smart-bond coupon and redemption rehearsal on SORA Nexus.",
              },
              params: {
                targetRaise: 400_000,
                couponPct: 6,
                tenorMonths: 36,
                denomination: 1_000,
                tangibleSharePct: 85,
                tractionFacts: 3,
                negativePledge: true,
                reportingCovenant: true,
                secured: false,
                esg: true,
                callable: false,
              },
              fraction: {
                unitSize: 50,
                minUnits: 2,
                priceBps: 10_000,
                transferability: "kyc-whitelist",
                lockupDays: 0,
                secondaryTrading: true,
                collateralEligible: true,
                paymentAssets: ["EUR", "XOR"],
                escrowDeadline: new Date(
                  Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), 1),
                )
                  .toISOString()
                  .slice(0, 10),
                milestone:
                  "First 10 rooftop installations connected to the grid",
              },
              accelerated: { leadSeconds },
            }),
            "issue accelerated monthly demo bond",
          );
          const bondId = String(issued.result.bondId);
          state = await api("GET", "/api/state");
          let accelerated = state.bonds.find(
            (bond: Json) => bond.terms.id === bondId,
          );
          expect(accelerated.terms.demo.accelerated).toBe(true);
          expect(
            accelerated.kernel.record.state.cashflows.map(
              (flow: Json) => flow.terms.kind,
            ),
          ).toEqual(["Coupon", "Coupon", "Redemption"]);
          expect(accelerated.kernel.record.state.cashflows[0]).toMatchObject({
            status: "Recorded",
            holders: 0,
          });
          for (const action of ["fund", "close"]) {
            await waitJob(
              await api(
                "POST",
                `/api/bonds/${bondId}/servicing`,
                { action, index: 0 },
                "broker",
              ),
              `${action} empty past-due coupon`,
            );
          }
          const units = 40;
          const beforeBuy = approvalsBefore();
          await waitJob(
            await api("POST", "/api/trades", { bondId, units, asset: "EUR" }),
            "subscribe 40 accelerated units (wallet-signed)",
          );
          expect(approvalsBefore()).toBeGreaterThan(beforeBuy);
          await waitJob(
            await api(
              "POST",
              `/api/bonds/${bondId}/escrow`,
              { action: "attest", conditionId: "min-raise" },
              "broker",
            ),
            "allot accelerated units after the minimum raise",
          );
          state = await api("GET", "/api/state");
          accelerated = state.bonds.find(
            (bond: Json) => bond.terms.id === bondId,
          );
          expect(state.balances.investor.bonds[bondId]).toBe(units);
          if (
            Date.now() >=
            accelerated.kernel.record.state.cashflows[1].terms.recordDateMs
          ) {
            throw new Error(
              "Accelerated setup overran the record date; increase PALMATRIX_LEAD_SECONDS",
            );
          }

          for (const [step, index] of [
            ["claim", 1],
            ["redeem", 2],
          ] as const) {
            if (!STEPS.has(step)) continue;
            const flow = accelerated.kernel.record.state.cashflows[index];
            await waitFor(
              `${step} record date`,
              async () =>
                Date.now() >= flow.terms.recordDateMs + 1_500
                  ? true
                  : undefined,
              (leadSeconds + 60) * 1_000,
            );
            await waitJob(
              await api(
                "POST",
                `/api/bonds/${bondId}/servicing`,
                { action: "record", index },
                "broker",
              ),
              `record ${step} entitlements`,
            );
            await waitJob(
              await api(
                "POST",
                `/api/bonds/${bondId}/servicing`,
                { action: "fund", index },
                "broker",
              ),
              `fund ${step} vault`,
            );
            await waitFor(
              `${step} payment date`,
              async () =>
                Date.now() >= flow.terms.paymentDateMs + 1_500
                  ? true
                  : undefined,
              (leadSeconds + 60) * 1_000,
            );
            state = await api("GET", "/api/state");
            accelerated = state.bonds.find(
              (bond: Json) => bond.terms.id === bondId,
            );
            const entitlement = accelerated.kernel.entitlements.find(
              (entry: Json) =>
                entry.index === index && entry.holder === account,
            );
            expect(entitlement).toMatchObject({
              units: String(units),
              claimedAtMs: null,
            });
            const beforeEur = BigInt(state.balances.investor.EUR);
            const beforeRedeemed = BigInt(
              accelerated.kernel.record.state.redeemedUnits,
            );
            const beforeOutstanding = BigInt(
              accelerated.kernel.record.state.outstandingUnits,
            );
            const beforeClaim = approvalsBefore();
            const paid = await waitJob(
              await api("POST", `/api/bonds/${bondId}/servicing`, {
                action: "claim",
                index,
              }),
              `${step === "claim" ? "claim coupon" : "redeem bond (burn + pay)"} through the wallet`,
            );
            expect(approvalsBefore()).toBe(beforeClaim + 1);
            const approval = confirmations
              .filter((confirmation) => confirmation.kind === "sign_request_tx")
              .at(-1)!;
            if (approval.kind !== "sign_request_tx")
              throw new Error("Expected a reviewed transaction approval");
            expect(approval.review.instructions).toHaveLength(1);
            expect(approval.review.instructions[0]).toMatchObject({
              kind: "bond",
              wireId: "iroha.bond",
              title: "Claim bond cash flow",
            });
            expect(approval.review.instructions[0]!.fields).toEqual(
              expect.arrayContaining([
                {
                  label: "Bond asset",
                  value: accelerated.onchain.assetDefinitionId,
                },
                { label: "Cash-flow index (zero-based)", value: String(index) },
                { label: "Holder / payment destination", value: account },
              ]),
            );
            expect(paid.txs).toHaveLength(1);
            expect(paid.txs[0]).toMatchObject({
              status: "applied",
              signer: "wallet",
              hash: expect.stringMatching(/^[0-9a-f]{64}$/iu),
            });
            state = await api("GET", "/api/state");
            expect(BigInt(state.balances.investor.EUR) - beforeEur).toBe(
              palmatrixPaymentCents(entitlement.amount),
            );
            expect(state.balances.investor.bonds[bondId] ?? 0).toBe(
              index === 2 ? 0 : units,
            );
            accelerated = state.bonds.find(
              (bond: Json) => bond.terms.id === bondId,
            );
            expect(
              BigInt(accelerated.kernel.record.state.redeemedUnits) -
                beforeRedeemed,
            ).toBe(index === 2 ? BigInt(units) : 0n);
            expect(
              beforeOutstanding -
                BigInt(accelerated.kernel.record.state.outstandingUnits),
            ).toBe(index === 2 ? BigInt(units) : 0n);
            if (index === 2)
              expect(BigInt(state.balances.investor.EUR) - beforeEur).toBe(
                BigInt(units) * 5_000n,
              );
            expect(
              accelerated.kernel.entitlements.find(
                (entry: Json) =>
                  entry.index === index && entry.holder === account,
              ).claimedAtMs,
            ).not.toBeNull();
            await expect(
              api("POST", `/api/bonds/${bondId}/servicing`, {
                action: "claim",
                index,
              }),
            ).rejects.toThrow("already_claimed");
            expect(approvalsBefore()).toBe(beforeClaim + 1);
            await waitJob(
              await api(
                "POST",
                `/api/bonds/${bondId}/servicing`,
                { action: "push", index },
                "broker",
              ),
              `push ${step} to early subscribers`,
            );
            await waitJob(
              await api(
                "POST",
                `/api/bonds/${bondId}/servicing`,
                { action: "close", index },
                "broker",
              ),
              `close ${step}`,
            );
          }
          if (STEPS.has("redeem")) {
            state = await api("GET", "/api/state");
            accelerated = state.bonds.find(
              (bond: Json) => bond.terms.id === bondId,
            );
            expect(accelerated.kernel.record.state.lifecycle).toBe("Matured");
            expect(accelerated.kernel.record.state.transfersFrozen).toBe(true);
          }
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
