import { describe, expect, it } from "vitest";

import {
  isIrohaConnectConfirmation,
  type IrohaConnectConfirmation,
} from "../electron/irohaConnectBoundary";
import { deriveAccountAddressView } from "../electron/accountAddress";

const ACCOUNT_ID = deriveAccountAddressView({
  domain: "default",
  publicKeyHex:
    "CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03",
  networkPrefix: 369,
}).accountId;

const sessionConfirmation = (): IrohaConnectConfirmation => ({
  kind: "session",
  sid: `${"A".repeat(42)}E`,
  accountId: ACCOUNT_ID,
  toriiUrl: "https://taira.sora.org",
  chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
  networkPrefix: 369,
  permissions: {
    methods: ["sign_raw"],
    events: [],
    resources: ["example:domain:v1"],
  },
});

describe("IrohaConnect native confirmation boundary", () => {
  it("accepts exact session and signing review payloads", () => {
    expect(isIrohaConnectConfirmation(sessionConfirmation())).toBe(true);
    expect(
      isIrohaConnectConfirmation({
        kind: "sign_request_tx",
        sid: `${"A".repeat(42)}E`,
        accountId: ACCOUNT_ID,
        toriiUrl: "https://taira.sora.org",
        chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
        networkPrefix: 369,
        domainTag: null,
        byteLength: 2,
        payloadPreviewHex: "00ff",
      }),
    ).toBe(true);
  });

  it("rejects aliases, unknown keys, and inconsistent previews", () => {
    expect(
      isIrohaConnectConfirmation({
        ...sessionConfirmation(),
        session_id: sessionConfirmation().sid,
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
        sid: `${"A".repeat(42)}E`,
        accountId: ACCOUNT_ID,
        toriiUrl: "https://taira.sora.org",
        chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
        networkPrefix: 369,
        domainTag: "example:domain:v1",
        byteLength: 2,
        payloadPreviewHex: "00",
      }),
    ).toBe(false);
  });

  it("rejects control, bidi, and non-NFC text before native display", () => {
    for (const domainTag of ["domain\u0085tag", "domain\u202etag", "e\u0301"]) {
      expect(
        isIrohaConnectConfirmation({
          kind: "sign_request_raw",
          sid: `${"A".repeat(42)}E`,
          accountId: ACCOUNT_ID,
          toriiUrl: "https://taira.sora.org",
          chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
          networkPrefix: 369,
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
