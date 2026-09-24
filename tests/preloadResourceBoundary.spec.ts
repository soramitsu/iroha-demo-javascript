import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const preload = readFileSync(resolve("electron/preload.ts"), "utf8");

const between = (startMarker: string, endMarker: string): string => {
  const start = preload.indexOf(startMarker);
  const end = preload.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing source marker ${startMarker}`).toBeGreaterThanOrEqual(
    0,
  );
  expect(end, `missing source marker ${endMarker}`).toBeGreaterThan(start);
  return preload.slice(start, end);
};

describe("first-release preload resource boundaries", () => {
  it("bounds clipboard text before it reaches the OS clipboard", () => {
    const clipboard = between(
      "async copyTextToClipboard(input)",
      "deriveAccountAddress(input)",
    );

    expect(clipboard).toContain("FIRST_RELEASE_CLIPBOARD_TEXT_MAX_BYTES");
    expect(clipboard).toContain('Buffer.byteLength(text, "utf8")');
  });

  it("bounds hexadecimal key material before allocating decoded bytes", () => {
    const decoder = between(
      "const hexToBuffer = (hex: string, label: string) =>",
      "const normalizePrivateKeyHex =",
    );

    expect(decoder).toContain("FIRST_RELEASE_CRYPTO_KEY_MATERIAL_MAX_BYTES");
    expect(decoder.indexOf("hex.length >")).toBeLessThan(
      decoder.indexOf('Buffer.from(hex, "hex")'),
    );
  });

  it("bounds the confidential note-index asset and page walk", () => {
    const fullScan = between(
      "const fetchConfidentialNoteIndexTransactions = async",
      "const resolveTrackedConfidentialAssetIds =",
    );

    expect(fullScan).toContain("assertFirstReleaseConfidentialScanTargets(");
    expect(fullScan).toContain("consumeFirstReleaseConfidentialNotePage(");
    expect(fullScan).toContain(
      "assertFirstReleaseConfidentialNoteContinuation(",
    );
    expect(fullScan).toContain("FIRST_RELEASE_CONFIDENTIAL_NOTE_PAGE_SIZE");
  });

  it("caps full account-history scans and has no automatic consolidation path", () => {
    const accountScan = between(
      "const listAllAccountTransactionsForConfidentialBackup = async",
      "const listAllAccountTransactions = async",
    );

    expect(accountScan).toContain(
      "FIRST_RELEASE_ACCOUNT_TRANSACTION_SCAN_MAX_ITEMS",
    );
    expect(accountScan).toContain(
      "FIRST_RELEASE_ACCOUNT_TRANSACTION_SCAN_MAX_PAGES",
    );
    expect(accountScan).toContain(
      "pagination stopped before the exact history was complete",
    );
    expect(preload).not.toContain("submitConfidentialSelfConsolidation");
    expect(preload).not.toContain("resolveConfidentialUnshieldMaterials");
  });

  it("checks subscription response arrays before decoding their items", () => {
    const planList = between(
      "const listSubscriptionPlansFromTorii = async",
      "const listSubscriptionsFromTorii = async",
    );
    const subscriptionList = between(
      "const listSubscriptionsFromTorii = async",
      "const getSubscriptionFromTorii = async",
    );

    for (const source of [planList, subscriptionList]) {
      expect(source.indexOf("requireFirstReleaseInputArray(")).toBeLessThan(
        source.indexOf("decodeSubscription"),
      );
    }
  });

  it("bounds the onboarding alias before serializing the request body", () => {
    const onboarding = between(
      "async onboardAccount(input)",
      "async requestFaucetFunds(input, onStatus)",
    );

    expect(onboarding).toMatch(
      /requireFirstReleaseInputText\(\s*alias,\s*"alias",\s*256\s*\)/u,
    );
    expect(onboarding.indexOf("requireFirstReleaseInputText(")).toBeLessThan(
      onboarding.indexOf("JSON.stringify({"),
    );
    expect(onboarding).toContain("alias: normalizedAlias");
  });
});
