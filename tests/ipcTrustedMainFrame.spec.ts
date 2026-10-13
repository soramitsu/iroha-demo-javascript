import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { assertTrustedMainFrameIpcSender } from "../electron/ipcTrustedMainFrame";

const trustedRendererUrl = "iroha-app://renderer/index.html";

const liveWindow = () => ({ isDestroyed: () => false });

describe("trusted main-frame IPC boundary", () => {
  it("accepts the live main window's top-level renderer frame and hash route", () => {
    const owner = liveWindow();
    const senderFrame = { url: `${trustedRendererUrl}#/wallet` };

    expect(() =>
      assertTrustedMainFrameIpcSender({
        owner,
        mainWindow: owner,
        senderFrame,
        mainFrame: senderFrame,
        trustedRendererUrl,
      }),
    ).not.toThrow();
  });

  it.each([
    {
      label: "missing owner",
      mutate: (input: BoundaryInput) => ({ ...input, owner: null }),
    },
    {
      label: "missing main window",
      mutate: (input: BoundaryInput) => ({ ...input, mainWindow: null }),
    },
    {
      label: "different owner",
      mutate: (input: BoundaryInput) => ({ ...input, owner: liveWindow() }),
    },
    {
      label: "destroyed owner",
      mutate: (input: BoundaryInput) => {
        const destroyedOwner = { isDestroyed: () => true };
        return {
          ...input,
          owner: destroyedOwner,
          mainWindow: destroyedOwner,
        };
      },
    },
    {
      label: "missing sender frame",
      mutate: (input: BoundaryInput) => ({ ...input, senderFrame: null }),
    },
    {
      label: "subframe",
      mutate: (input: BoundaryInput) => ({
        ...input,
        senderFrame: { url: trustedRendererUrl },
      }),
    },
    {
      label: "same-origin asset path",
      mutate: (input: BoundaryInput) => {
        const unexpectedFrame = {
          url: "iroha-app://renderer/assets/app.js",
        };
        return {
          ...input,
          senderFrame: unexpectedFrame,
          mainFrame: unexpectedFrame,
        };
      },
    },
    {
      label: "same-origin query",
      mutate: (input: BoundaryInput) => {
        const unexpectedFrame = {
          url: `${trustedRendererUrl}?mode=unexpected#/wallet`,
        };
        return {
          ...input,
          senderFrame: unexpectedFrame,
          mainFrame: unexpectedFrame,
        };
      },
    },
    {
      label: "empty trusted URL",
      mutate: (input: BoundaryInput) => {
        const emptyFrame = { url: "" };
        return {
          ...input,
          senderFrame: emptyFrame,
          mainFrame: emptyFrame,
          trustedRendererUrl: "",
        };
      },
    },
  ])("rejects $label", ({ mutate }) => {
    const owner = liveWindow();
    const senderFrame = { url: trustedRendererUrl };
    const input: BoundaryInput = {
      owner,
      mainWindow: owner,
      senderFrame,
      mainFrame: senderFrame,
      trustedRendererUrl,
    };

    expect(() => assertTrustedMainFrameIpcSender(mutate(input))).toThrow(
      /trusted top-level wallet frame/u,
    );
  });

  it("guards every VPN, vault, and runtime-config handler before access", () => {
    const mainPath = resolve(process.cwd(), "electron/main.ts");
    const source = readFileSync(mainPath, "utf8");
    const groups = [
      {
        start: "const registerVpnHandlers",
        end: "const registerVaultHandlers",
        channels: [
          "vpn:getAvailability",
          "vpn:getProfile",
          "vpn:getStatus",
          "vpn:connect",
          "vpn:disconnect",
          "vpn:disconnectLocal",
          "vpn:repair",
          "vpn:listReceipts",
        ],
        access: "vpnRuntime.",
      },
      {
        start: "const registerVaultHandlers",
        end: "const registerGovernanceRuntimeConfigHandler",
        channels: [
          "vault:isAvailable",
          "vault:storeAccountSecret",
          "vault:getAccountSecretMaterial",
          "vault:listAccountSecretFlags",
          "vault:storeReceiveKeys",
          "vault:listReceiveKeysForAccount",
        ],
        access: "secureVault.",
      },
    ] as const;

    for (const group of groups) {
      const groupSource = source.slice(
        source.indexOf(group.start),
        source.indexOf(group.end),
      );
      for (const [index, channel] of group.channels.entries()) {
        const handlerStart = groupSource.indexOf(`"${channel}"`);
        const nextChannel = group.channels[index + 1];
        const handlerEnd = nextChannel
          ? groupSource.indexOf(`"${nextChannel}"`, handlerStart)
          : groupSource.length;
        const handlerSource = groupSource.slice(handlerStart, handlerEnd);
        const assertion = handlerSource.indexOf(
          "assertTrustedMainFrameIpcEvent(event);",
        );
        const access = handlerSource.indexOf(group.access);
        expect(assertion, `${channel} trust assertion`).toBeGreaterThan(-1);
        expect(access, `${channel} protected access`).toBeGreaterThan(
          assertion,
        );
      }
    }

    const configSource = source.slice(
      source.indexOf("const registerGovernanceRuntimeConfigHandler"),
      source.indexOf("const registerGovernanceValidationFeePolicyHandler"),
    );
    expect(
      configSource.indexOf("assertTrustedMainFrameIpcEvent(event);"),
    ).toBeGreaterThan(-1);
    expect(
      configSource.indexOf("loadGovernanceRuntimeConfig({"),
    ).toBeGreaterThan(
      configSource.indexOf("assertTrustedMainFrameIpcEvent(event);"),
    );
    expect(configSource).toContain(
      'assertNoIpcArguments(args, "Governance runtime configuration");',
    );

    for (const label of [
      "Local VPN disconnect",
      "VPN repair",
      "Secure vault availability",
    ]) {
      expect(source).toContain(`assertNoIpcArguments(args, "${label}");`);
    }
    const vaultSource = source.slice(
      source.indexOf("const registerVaultHandlers"),
      source.indexOf("const registerGovernanceRuntimeConfigHandler"),
    );
    expect(
      vaultSource.match(/requireFirstReleaseIpcInputObject/g),
    ).toHaveLength(5);
  });

  it("guards and bounds clipboard writes in the main process", () => {
    const source = readFileSync(
      resolve(process.cwd(), "electron/main.ts"),
      "utf8",
    );
    const start = source.indexOf("const registerClipboardHandler");
    const end = source.indexOf("const registerVpnHandlers", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const handler = source.slice(start, end);
    const trust = handler.indexOf("assertTrustedMainFrameIpcEvent(event);");
    const bound = handler.indexOf("FIRST_RELEASE_CLIPBOARD_TEXT_MAX_BYTES");
    const write = handler.indexOf("clipboard.writeText(text);");
    expect(trust).toBeGreaterThan(-1);
    expect(bound).toBeGreaterThan(trust);
    expect(write).toBeGreaterThan(bound);
    expect(source).toContain("registerClipboardHandler();");
  });

  it("never imports main-process-only Electron modules into the preload", () => {
    const preload = readFileSync(
      resolve(process.cwd(), "electron/preload.ts"),
      "utf8",
    );
    const electronImport = preload.match(
      /import \{([^}]*)\} from "electron";/u,
    );
    expect(electronImport).not.toBeNull();
    const names = electronImport![1]
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    expect(names.sort()).toEqual(["contextBridge", "ipcRenderer"]);
  });

  it("bounds and snapshots the exact receive-key batch before one atomic vault call", () => {
    const mainPath = resolve(process.cwd(), "electron/main.ts");
    const source = readFileSync(mainPath, "utf8");
    const handlerStart = source.indexOf(
      'ipcMain.handle("vault:storeReceiveKeys"',
    );
    const handlerEnd = source.indexOf(
      'ipcMain.handle("vault:listReceiveKeysForAccount"',
      handlerStart,
    );
    expect(handlerStart).toBeGreaterThan(-1);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    const handler = source.slice(handlerStart, handlerEnd);
    const trust = handler.indexOf("assertTrustedMainFrameIpcEvent(event);");
    const exactEnvelope = handler.indexOf("requireFirstReleaseIpcInputObject");
    const boundedArray = handler.indexOf("requireFirstReleaseInputArray(");
    const vaultCall = handler.indexOf("secureVault.storeReceiveKeys(");
    expect(trust).toBeGreaterThan(-1);
    expect(exactEnvelope).toBeGreaterThan(trust);
    expect(boundedArray).toBeGreaterThan(exactEnvelope);
    expect(vaultCall).toBeGreaterThan(boundedArray);
    expect(handler).toContain('required: ["records"]');
    expect(handler).toContain("SECURE_VAULT_MAX_RECEIVE_KEY_BATCH");
    expect(handler).toContain("return { stored: records.length };");
    expect(source).not.toContain('"vault:storeReceiveKey",');
  });
});

type BoundaryInput = Parameters<typeof assertTrustedMainFrameIpcSender>[0];
