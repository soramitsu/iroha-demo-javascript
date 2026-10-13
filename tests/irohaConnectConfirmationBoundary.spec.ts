import { describe, expect, it } from "vitest";

import {
  isIrohaConnectConfirmation,
  type IrohaConnectConfirmation,
} from "../electron/irohaConnectBoundary";
import { deriveAccountAddressView } from "../electron/accountAddress";
import type { ConnectTransactionReview } from "@/types/connectTransactionReview";
import {
  TEST_PREVIOUS_TAIRA_NETWORK_ID,
  TEST_TAIRA_NETWORK_ID,
} from "./helpers/networkIdentityFixture";

const ACCOUNT_ID = deriveAccountAddressView({
  domain: "default",
  publicKeyHex:
    "CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03",
  networkPrefix: 369,
}).accountId;

const context = {
  sid: `${"A".repeat(42)}E`,
  accountId: ACCOUNT_ID,
  toriiUrl: "https://taira.sora.org",
  chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
  networkPrefix: 369,
  networkId: TEST_TAIRA_NETWORK_ID,
};

const sessionConfirmation = (): IrohaConnectConfirmation => ({
  kind: "session",
  ...context,
  permissions: {
    methods: ["sign_raw", "sign_transaction"],
    events: [],
    resources: ["example:domain:v1"],
  },
});

const review = (
  overrides: Partial<ConnectTransactionReview> = {},
): ConnectTransactionReview => ({
  schema: "iroha.wallet.connect-transaction-review.v1",
  networkId: TEST_TAIRA_NETWORK_ID,
  authority: ACCOUNT_ID,
  payloadHashHex: `${"ab".repeat(31)}ad`,
  payloadByteLength: 512,
  creationTimeMs: "1791861265764",
  ttlMs: "60000",
  executable: "instructions",
  instructions: [
    {
      index: 1,
      wireId: "iroha.transfer",
      kind: "transfer",
      title: "Transfer asset",
      fields: [{ label: "Amount", value: "10" }],
      json: null,
      warning: null,
    },
  ],
  warnings: [],
  ...overrides,
});

describe("IrohaConnect native confirmation boundary", () => {
  it("accepts exact session, raw, and transaction review payloads", () => {
    expect(isIrohaConnectConfirmation(sessionConfirmation())).toBe(true);
    expect(
      isIrohaConnectConfirmation({
        kind: "sign_request_raw",
        ...context,
        domainTag: "example:domain:v1",
        byteLength: 2,
        payloadPreviewHex: "00ff",
      }),
    ).toBe(true);
    expect(
      isIrohaConnectConfirmation({
        kind: "sign_request_tx",
        ...context,
        review: review(),
      }),
    ).toBe(true);
  });

  it("rejects transaction reviews that do not bind the session", () => {
    for (const candidate of [
      review({ authority: "someone-else" }),
      review({ networkId: TEST_PREVIOUS_TAIRA_NETWORK_ID }),
      review({ payloadHashHex: "AB".repeat(32) }),
      review({ instructions: [] }),
      { ...review(), extra: true },
    ]) {
      expect(
        isIrohaConnectConfirmation({
          kind: "sign_request_tx",
          ...context,
          review: candidate,
        }),
      ).toBe(false);
    }
    expect(
      isIrohaConnectConfirmation({
        kind: "sign_request_tx",
        ...context,
        domainTag: null,
        byteLength: 2,
        payloadPreviewHex: "00ff",
      }),
    ).toBe(false);
  });

  it("rejects aliases, unknown keys, missing network IDs, and inconsistent previews", () => {
    expect(
      isIrohaConnectConfirmation({
        ...sessionConfirmation(),
        session_id: sessionConfirmation().sid,
      }),
    ).toBe(false);
    expect(
      isIrohaConnectConfirmation({
        ...sessionConfirmation(),
        networkId: TEST_TAIRA_NETWORK_ID.toLowerCase(),
      }),
    ).toBe(false);
    expect(
      isIrohaConnectConfirmation({
        ...sessionConfirmation(),
        permissions: {
          methods: ["sign_raw", "sign_raw"],
          events: [],
          resources: ["example:domain:v1"],
        },
      }),
    ).toBe(false);
    expect(
      isIrohaConnectConfirmation({
        kind: "sign_request_raw",
        ...context,
        domainTag: "example:domain:v1",
        byteLength: 2,
        payloadPreviewHex: "00",
      }),
    ).toBe(false);
  });

  it("rejects control, bidi, and non-NFC text before native display", () => {
    for (const domainTag of ["domain\u0085tag", "domain‮tag", "é"]) {
      expect(
        isIrohaConnectConfirmation({
          kind: "sign_request_raw",
          ...context,
          domainTag,
          byteLength: 1,
          payloadPreviewHex: "00",
        }),
      ).toBe(false);
    }
  });

  it("rejects a path-scoped endpoint before native display", () => {
    expect(
      isIrohaConnectConfirmation({
        ...sessionConfirmation(),
        toriiUrl: "https://taira.sora.org/proxy",
      }),
    ).toBe(false);
  });
});
