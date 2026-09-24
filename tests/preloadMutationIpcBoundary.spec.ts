import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(resolve("electron/preload.ts"), "utf8");

const between = (startMarker: string, endMarker: string): string => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing ${startMarker}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
};

const expectBoundaryBefore = (
  chunk: string,
  kind: string,
  sensitiveOperation: string,
) => {
  const boundary = chunk.indexOf(`"${kind}"`);
  const sensitive = chunk.indexOf(sensitiveOperation);
  expect(boundary, `missing ${kind} boundary`).toBeGreaterThanOrEqual(0);
  expect(sensitive, `missing ${sensitiveOperation}`).toBeGreaterThanOrEqual(0);
  expect(boundary).toBeLessThan(sensitive);
};

describe("preload first-release mutation IPC boundary", () => {
  it.each([
    {
      start: "generateKeyPair(input)",
      end: "generateKaigiSignalKeyPair()",
      kind: "generateKeyPair",
      sensitive: "generateSdkKeyPair(",
    },
    {
      start: "async storeAccountSecret(input)",
      end: "async listAccountSecretFlags(",
      kind: "storeAccountSecret",
      sensitive: "storeAccountSecretInVault(",
    },
    {
      start: "async createConfidentialPaymentAddress(input)",
      end: "async exportConfidentialWalletBackup(input)",
      kind: "createConfidentialPaymentAddress",
      sensitive: "createStoredConfidentialReceiveDescriptor(",
    },
    {
      start: "async copyTextToClipboard(input)",
      end: "deriveAccountAddress(",
      kind: "copyTextToClipboard",
      sensitive: "clipboard.writeText(",
    },
    {
      start: "derivePublicKey(input)",
      end: "async resolveAccountAlias(input)",
      kind: "derivePublicKey",
      sensitive: "publicKeyFromPrivate(",
    },
    {
      start: "async exportConfidentialWalletBackup(input)",
      end: "async importConfidentialWalletBackup(input)",
      kind: "exportConfidentialWalletBackup",
      sensitive: "listConfidentialReceiveKeysForAccount(",
    },
    {
      start: "async importConfidentialWalletBackup(input)",
      end: "async registerAccount(input)",
      kind: "importConfidentialWalletBackup",
      sensitive: "storeConfidentialReceiveKeysInVault(",
    },
    {
      start: "async registerAccount(input)",
      end: "async transferAsset(rendererInput)",
      kind: "registerAccount",
      sensitive: "assertWriteConnectionMatchesEndpoint(",
    },
    {
      start: "async transferAsset(rendererInput)",
      end: "setIrohaConnectContext(input)",
      kind: "transferAsset",
      sensitive: "assertWriteConnectionMatchesEndpoint(",
    },
    {
      start: "setIrohaConnectContext(input)",
      end: "resetIrohaConnectBoundary()",
      kind: "irohaConnectContext",
      sensitive: "irohaConnectBoundary.setContext(",
    },
    {
      start: "approveIrohaConnectSession(input)",
      end: "processIrohaConnectFrame(input)",
      kind: "irohaConnectApproveSession",
      sensitive: "irohaConnectBoundary.approveSession(",
    },
    {
      start: "processIrohaConnectFrame(input)",
      end: "approveIrohaConnectRequest(input)",
      kind: "irohaConnectProcessFrame",
      sensitive: "irohaConnectBoundary.processFrame(",
    },
    {
      start: "approveIrohaConnectRequest(input)",
      end: "rejectIrohaConnectRequest(input)",
      kind: "irohaConnectApproveRequest",
      sensitive: "irohaConnectBoundary.approveRequest(",
    },
    {
      start: "rejectIrohaConnectRequest(input)",
      end: "closeIrohaConnectSession(input)",
      kind: "irohaConnectRejectRequest",
      sensitive: "irohaConnectBoundary.rejectRequest(",
    },
    {
      start: "closeIrohaConnectSession(input)",
      end: "async getConfidentialAssetPolicy(",
      kind: "irohaConnectCloseSession",
      sensitive: "irohaConnectBoundary.closeSession(",
    },
    {
      start: "async getVpnStatus(input)",
      end: "async connectVpn(input)",
      kind: "vpnAuthenticatedContext",
      sensitive: "resolveOptionalSigningMaterial(",
    },
    {
      start: "async connectVpn(input)",
      end: "async disconnectVpn(input)",
      kind: "vpnConnect",
      sensitive: "assertWriteConnectionMatchesEndpoint(",
    },
    {
      start: "async disconnectVpn(input)",
      end: "async repairVpn()",
      kind: "vpnAuthenticatedContext",
      sensitive: "assertWriteConnectionMatchesEndpoint(",
    },
    {
      start: "async listVpnReceipts(input)",
      end: "async onboardAccount(input)",
      kind: "vpnAuthenticatedContext",
      sensitive: "resolveOptionalSigningMaterial(",
    },
    {
      start: "async onboardAccount(input)",
      end: "async requestFaucetFunds(",
      kind: "onboardAccount",
      sensitive: "assertWriteConnectionMatchesEndpoint(",
    },
    {
      start: "stopWatchingKaigiCallEvents(input)",
      end: "async pollKaigiMeetingSignals(input)",
      kind: "kaigiStopWatch",
      sensitive: "watcher.abort()",
    },
  ])(
    "$kind validates exact renderer input before $sensitive",
    ({ start, end, kind, sensitive }) => {
      expectBoundaryBefore(between(start, end), kind, sensitive);
    },
  );

  it("validates the session envelope and its nested wallet context", () => {
    const chunk = between(
      "prepareIrohaConnectSession(input)",
      "approveIrohaConnectSession(input)",
    );
    expectBoundaryBefore(
      chunk,
      "irohaConnectPrepareSession",
      "irohaConnectBoundary.prepareSession(",
    );
    expectBoundaryBefore(
      chunk,
      "irohaConnectContext",
      "irohaConnectBoundary.prepareSession(",
    );
  });

  it.each([
    ["generateKeyPair(input)", "generateKaigiSignalKeyPair()"],
    ["async storeAccountSecret(input)", "async listAccountSecretFlags("],
    ["derivePublicKey(input)", "async resolveAccountAlias(input)"],
  ])("requires an explicit algorithm in %s", (start, end) => {
    expect(between(start, end)).toContain(
      "normalizeRequiredBridgeSigningAlgorithm(",
    );
  });

  it("binds a stored account secret to its derived account ID before vault access", () => {
    const chunk = between(
      "async storeAccountSecret(input)",
      "async listAccountSecretFlags(",
    );
    expect(chunk.indexOf("requireAccountIdBoundToPublicKey({")).toBeGreaterThan(
      -1,
    );
    expect(chunk.indexOf("requireAccountIdBoundToPublicKey({")).toBeLessThan(
      chunk.indexOf("storeAccountSecretInVault("),
    );
  });

  it("revalidates vault signing material against the requested account before use", () => {
    const chunk = between(
      "const resolveOptionalSigningMaterial",
      "const resolveSigningMaterial",
    );
    expect(chunk).toContain("publicKeyFromPrivate(");
    expect(chunk).toContain("requireAccountIdBoundToPublicKey({");
    expect(chunk.indexOf("requireAccountIdBoundToPublicKey({")).toBeLessThan(
      chunk.indexOf("return signingMaterial;"),
    );
  });

  it.each([
    [
      "async exportConfidentialWalletBackup(input)",
      "async importConfidentialWalletBackup(input)",
      "backup export",
      "listConfidentialReceiveKeysForAccount(",
    ],
    [
      "async importConfidentialWalletBackup(input)",
      "async registerAccount(input)",
      "backup restore",
      "decryptConfidentialWalletBackupState(",
    ],
  ])(
    "requires a trusted endpoint scope before confidential %s state access",
    (start, end, operation, sensitive) => {
      const chunk = between(start, end);
      expect(chunk).toContain("if (!endpointScope)");
      expect(chunk).toContain(`Confidential wallet ${operation} requires`);
      expect(chunk.indexOf("if (!endpointScope)")).toBeLessThan(
        chunk.indexOf(sensitive),
      );
    },
  );

  it("persists restored confidential shadow state before caching success", () => {
    const preparation = between(
      "const prepareConfidentialWalletShadowState",
      "const writeConfidentialWalletShadowState",
    );
    expect(preparation).toContain("conflicting records");
    expect(preparation).toContain("JSON.stringify(existing)");
    expect(preparation).toContain("no records were stored");
    expect(preparation).not.toContain(".slice(-128)");

    const chunk = between(
      "const writeConfidentialWalletShadowState",
      "const deriveConfidentialWalletBackupKey",
    );
    expect(chunk).toContain("storage.setItem(key, encoded)");
    expect(chunk).toContain("backup restore was not completed");
    expect(chunk.indexOf("storage.setItem(key, encoded)")).toBeLessThan(
      chunk.indexOf("confidentialWalletShadowStateCache.set(key, normalized)"),
    );

    const restore = between(
      "async importConfidentialWalletBackup(input)",
      "async registerAccount(input)",
    );
    expect(
      restore.indexOf("prepareConfidentialWalletShadowState("),
    ).toBeLessThan(restore.indexOf("storeConfidentialReceiveKeysInVault("));
  });

  it("stores a restored receive-key batch through one exact secret-free IPC response", () => {
    const helper = between(
      "const storeConfidentialReceiveKeysInVault",
      "const listConfidentialReceiveKeysForAccount",
    );
    expect(helper).toContain("requireFirstReleaseInputArray(");
    expect(helper).toContain("SECURE_VAULT_MAX_RECEIVE_KEY_BATCH");
    expect(helper).toContain(
      'ipcRenderer.invoke("vault:storeReceiveKeys", { records })',
    );
    expect(helper).toContain("requireFirstReleaseIpcInputObject");
    expect(helper).toContain('required: ["stored"]');
    expect(helper).toContain("response.stored !== records.length");
    expect(helper).not.toContain("privateKeyBase64Url:");

    const restore = between(
      "async importConfidentialWalletBackup(input)",
      "async registerAccount(input)",
    );
    expect(
      restore.match(/storeConfidentialReceiveKeysInVault\(/gu),
    ).toHaveLength(1);
    expect(restore).toContain(
      "await storeConfidentialReceiveKeysInVault(\n      decryptedState.receiveKeys.map(",
    );
    expect(source).not.toContain("storeConfidentialReceiveKeyInVault");
  });

  it("snapshots public shadow JSON within finite limits before recursive inspection", () => {
    const chunk = between(
      "const clonePublicShadowRecord",
      "const parsePendingConfidentialWalletShadowTransaction",
    );
    expect(chunk).toContain("requireFirstReleaseJsonObject(value, label)");
    expect(
      chunk.indexOf("requireFirstReleaseJsonObject(value, label)"),
    ).toBeLessThan(chunk.indexOf("assertPublicShadowJsonValue(cloned, label)"));
    expect(chunk).not.toContain("JSON.stringify(value)");
  });

  it("validates transfer primitives before endpoint inspection or vault access", () => {
    const chunk = between(
      "async transferAsset(rendererInput)",
      "setIrohaConnectContext(input)",
    );
    const endpoint = chunk.indexOf("assertWriteConnectionMatchesEndpoint(");
    expect(endpoint).toBeGreaterThanOrEqual(0);
    for (const preflight of [
      "requireFirstReleaseInputText(input.memo",
      "normalizeCanonicalAccountIdLiteral(",
      "requireFirstReleaseInputText(\n      input.destinationAccountId",
      "normalizeFirstReleaseAssetDefinitionId(",
      "requireFirstReleaseTransferQuantity(input.quantity)",
    ]) {
      expect(
        chunk.indexOf(preflight),
        `missing ${preflight}`,
      ).toBeGreaterThanOrEqual(0);
      expect(chunk.indexOf(preflight)).toBeLessThan(endpoint);
    }
    expect(chunk).not.toContain("input.metadata");
  });

  it("validates the exact bounded backup metadata before vault access or decoding", () => {
    const parser = between(
      "const parseConfidentialWalletBackupMetadataInput",
      "const decryptConfidentialWalletBackupState",
    );
    expect(parser).toContain("requireFirstReleaseIpcInputObject");
    expect(parser).toContain(
      "CONFIDENTIAL_WALLET_BACKUP_CIPHERTEXT_MAX_CHARACTERS",
    );
    expect(parser).toContain('stateBox.kdf !== "HKDF-SHA256"');
    expect(parser).toContain('stateBox.cipher !== "AES-256-GCM"');

    const restore = between(
      "async importConfidentialWalletBackup(input)",
      "async registerAccount(input)",
    );
    expect(
      restore.indexOf("parseConfidentialWalletBackupMetadataInput("),
    ).toBeLessThan(restore.indexOf("assertSecureVaultAvailable("));

    const decrypt = between(
      "const decryptConfidentialWalletBackupState",
      "const mergeConfidentialWalletShadowTransactions",
    );
    expect(decrypt).toContain("decodeCanonicalBase64Url");
    expect(decrypt.indexOf("decodeCanonicalBase64Url(")).toBeLessThan(
      decrypt.indexOf("createDecipheriv("),
    );
  });

  it("refuses to export or merge an unreadable durable confidential shadow", () => {
    const reader = between(
      "const readConfidentialWalletShadowState",
      "const writeConfidentialWalletShadowState",
    );
    expect(reader).toContain("cached && options.requireDurable !== true");
    expect(reader).toContain("could not be read durably");

    for (const [start, end] of [
      [
        "async exportConfidentialWalletBackup(input)",
        "async importConfidentialWalletBackup(input)",
      ],
      [
        "async importConfidentialWalletBackup(input)",
        "async registerAccount(input)",
      ],
    ]) {
      expect(between(start, end)).toMatch(/requireDurable:\s*true/u);
    }
  });
});
