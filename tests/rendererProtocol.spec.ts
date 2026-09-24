import { afterEach, describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  RENDERER_PROTOCOL_ORIGIN,
  RENDERER_PROTOCOL_PRIVILEGES,
  RENDERER_ASSET_MAX_BYTES,
  RENDERER_URL_MAX_LENGTH,
  RENDERER_SECURITY_HEADERS,
  RENDERER_WORKER_SECURITY_HEADERS,
  isSafeExternalNavigationUrl,
  isTrustedRendererNavigationUrl,
  readRendererProtocolAsset,
  rendererSecurityHeadersForDestination,
  resolveRendererEntryUrl,
  resolveRendererProtocolAssetPath,
} from "../electron/rendererProtocol";

describe("packaged renderer protocol", () => {
  const rendererRoot = resolve("/opt/iroha-demo/renderer");
  const temporaryRoots: string[] = [];

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("registers a secure standard origin without bypassing CSP or CORS", () => {
    expect(RENDERER_PROTOCOL_PRIVILEGES).toMatchObject({
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true,
    });
    expect(RENDERER_PROTOCOL_PRIVILEGES).not.toHaveProperty("bypassCSP");
    expect(RENDERER_PROTOCOL_PRIVILEGES).not.toHaveProperty("corsEnabled");
    expect(RENDERER_SECURITY_HEADERS["Content-Security-Policy"]).toContain(
      "default-src 'none'",
    );
    expect(RENDERER_SECURITY_HEADERS["Content-Security-Policy"]).toContain(
      "script-src 'self'",
    );
    expect(RENDERER_SECURITY_HEADERS["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(RENDERER_SECURITY_HEADERS["Content-Security-Policy"]).toContain(
      "connect-src 'self' data: wss: ws://localhost:* ws://127.0.0.1:* ws://[::1]:*",
    );
    expect(RENDERER_SECURITY_HEADERS["Referrer-Policy"]).toBe("no-referrer");
  });

  it("keeps worker execution on packaged code", () => {
    expect(rendererSecurityHeadersForDestination("document")).toBe(
      RENDERER_SECURITY_HEADERS,
    );
    expect(rendererSecurityHeadersForDestination("worker")).toBe(
      RENDERER_WORKER_SECURITY_HEADERS,
    );
    expect(
      RENDERER_WORKER_SECURITY_HEADERS["Content-Security-Policy"],
    ).toContain("script-src 'self'");
    expect(
      RENDERER_WORKER_SECURITY_HEADERS["Content-Security-Policy"],
    ).not.toMatch(/https:|http:/u);
  });

  it("opens only uncredentialed HTTPS URLs outside the privileged window", () => {
    expect(isSafeExternalNavigationUrl("https://explorer.example/tx/1")).toBe(
      true,
    );
    for (const url of [
      "http://explorer.example/tx/1",
      "http://127.0.0.1:8080/tx/1",
      "https://user:secret@explorer.example/tx/1",
      "javascript:alert(1)",
      "iroha-app://renderer/index.html",
    ]) {
      expect(isSafeExternalNavigationUrl(url)).toBe(false);
    }
    expect(
      isSafeExternalNavigationUrl(
        `https://example.invalid/${"x".repeat(RENDERER_URL_MAX_LENGTH)}`,
      ),
    ).toBe(false);
    expect(isSafeExternalNavigationUrl(" https://example.invalid/")).toBe(
      false,
    );
    expect(isSafeExternalNavigationUrl("https://example.invalid/\npath")).toBe(
      false,
    );
  });

  it("maps the root and packaged assets inside the renderer root", () => {
    expect(
      resolveRendererProtocolAssetPath({
        requestUrl: `${RENDERER_PROTOCOL_ORIGIN}/`,
        rendererRoot,
      }),
    ).toBe(resolve(rendererRoot, "index.html"));
    expect(
      resolveRendererProtocolAssetPath({
        requestUrl: `${RENDERER_PROTOCOL_ORIGIN}/assets/wallet-icon.svg`,
        rendererRoot,
      }),
    ).toBe(resolve(rendererRoot, "assets/wallet-icon.svg"));
  });

  it.each([
    "iroha-app://attacker/index.html",
    "https://renderer/index.html",
    "iroha-app://user:secret@renderer/index.html",
    "iroha-app://renderer:443/index.html",
    "iroha-app://renderer/../secret",
    "iroha-app://renderer/%2e%2e/secret",
    "iroha-app://renderer/%252e%252e%252fsecret",
    "iroha-app://renderer/%2525252525252525252e%2525252525252525252e%2525252525252525252fsecret",
    "iroha-app://renderer/%5c..%5csecret",
    "iroha-app://renderer/%00secret",
    "iroha-app://renderer./index.html",
    "iroha-app://renderer:0/index.html",
    "iroha-app://renderer/%0asecret",
    `${RENDERER_PROTOCOL_ORIGIN}/${"x".repeat(RENDERER_URL_MAX_LENGTH)}`,
    "iroha-app://renderer/",
  ])("rejects unsafe or non-file asset target %s when applicable", (url) => {
    if (url === `${RENDERER_PROTOCOL_ORIGIN}/`) {
      expect(() =>
        resolveRendererProtocolAssetPath({ requestUrl: url, rendererRoot }),
      ).not.toThrow();
      return;
    }
    expect(() =>
      resolveRendererProtocolAssetPath({ requestUrl: url, rendererRoot }),
    ).toThrow();
  });

  it("reads exact regular-file bytes and rejects a symlink escaping the renderer root", async () => {
    const root = mkdtempSync(join(tmpdir(), "iroha-renderer-protocol-"));
    temporaryRoots.push(root);
    const renderer = join(root, "renderer");
    const outside = join(root, "outside.js");
    mkdirSync(join(renderer, "assets"), { recursive: true });
    writeFileSync(join(renderer, "index.html"), "<!doctype html><p>safe</p>");
    writeFileSync(outside, "export const escaped = true;");
    symlinkSync(outside, join(renderer, "assets", "escaped.js"));

    await expect(
      readRendererProtocolAsset({
        requestUrl: `${RENDERER_PROTOCOL_ORIGIN}/index.html`,
        rendererRoot: renderer,
      }),
    ).resolves.toMatchObject({
      contentType: "text/html; charset=utf-8",
      bytes: new Uint8Array(Buffer.from("<!doctype html><p>safe</p>", "utf8")),
    });
    await expect(
      readRendererProtocolAsset({
        requestUrl: `${RENDERER_PROTOCOL_ORIGIN}/assets/escaped.js`,
        rendererRoot: renderer,
      }),
    ).rejects.toThrow(/target symlink/u);
  });

  it("rejects a final target symlink even when it points to a file inside the renderer root", async () => {
    const root = mkdtempSync(join(tmpdir(), "iroha-renderer-protocol-"));
    temporaryRoots.push(root);
    const renderer = join(root, "renderer");
    const asset = join(renderer, "assets", "real.js");
    mkdirSync(join(renderer, "assets"), { recursive: true });
    writeFileSync(asset, "export const safe = true;");
    symlinkSync(asset, join(renderer, "assets", "linked.js"));

    await expect(
      readRendererProtocolAsset({
        requestUrl: `${RENDERER_PROTOCOL_ORIGIN}/assets/linked.js`,
        rendererRoot: renderer,
      }),
    ).rejects.toThrow(/target symlink/u);
  });

  it("rejects oversized packaged assets before reading them", async () => {
    const root = mkdtempSync(join(tmpdir(), "iroha-renderer-protocol-"));
    temporaryRoots.push(root);
    const renderer = join(root, "renderer");
    mkdirSync(renderer, { recursive: true });
    const oversized = join(renderer, "oversized.bin");
    writeFileSync(oversized, Buffer.alloc(RENDERER_ASSET_MAX_BYTES + 1));

    await expect(
      readRendererProtocolAsset({
        requestUrl: `${RENDERER_PROTOCOL_ORIGIN}/oversized.bin`,
        rendererRoot: renderer,
      }),
    ).rejects.toThrow(/exceeds/u);
  });

  it("ignores development renderer injection when packaged and allows only loopback development origins", () => {
    expect(
      resolveRendererEntryUrl({
        isPackaged: true,
        environmentUrl: "https://attacker.invalid/renderer",
      }),
    ).toBe(`${RENDERER_PROTOCOL_ORIGIN}/index.html`);
    expect(
      resolveRendererEntryUrl({
        isPackaged: false,
        environmentUrl: "http://localhost:5173/#/wallet",
      }),
    ).toBe("http://localhost:5173/#/wallet");
    expect(
      resolveRendererEntryUrl({
        isPackaged: false,
        environmentUrl: "https://[::1]:5173/",
      }),
    ).toBe("https://[::1]:5173/");

    for (const environmentUrl of [
      "https://attacker.invalid/",
      "http://localhost.attacker.invalid:5173/",
      "http://user:secret@localhost:5173/",
      "file:///tmp/renderer.html",
      "javascript:alert(1)",
      " http://localhost:5173/",
      `http://localhost:5173/${"x".repeat(RENDERER_URL_MAX_LENGTH)}`,
    ]) {
      expect(() =>
        resolveRendererEntryUrl({ isPackaged: false, environmentUrl }),
      ).toThrow(/renderer development URL/u);
    }
  });

  it("allows hash routing but rejects renderer navigation to any other document or origin", () => {
    const packagedEntry = `${RENDERER_PROTOCOL_ORIGIN}/index.html`;
    expect(
      isTrustedRendererNavigationUrl(
        `${packagedEntry}#/wallet?tab=activity`,
        packagedEntry,
      ),
    ).toBe(true);
    expect(
      isTrustedRendererNavigationUrl(
        `${RENDERER_PROTOCOL_ORIGIN}/index.html?remote=1#/wallet`,
        packagedEntry,
      ),
    ).toBe(false);
    expect(
      isTrustedRendererNavigationUrl(
        ` ${RENDERER_PROTOCOL_ORIGIN}/index.html`,
        packagedEntry,
      ),
    ).toBe(false);
    expect(
      isTrustedRendererNavigationUrl(
        packagedEntry,
        "iroha-app://user:secret@renderer/index.html",
      ),
    ).toBe(false);
    expect(
      isTrustedRendererNavigationUrl(
        `${packagedEntry}#${"x".repeat(RENDERER_URL_MAX_LENGTH)}`,
        packagedEntry,
      ),
    ).toBe(false);
    expect(
      isTrustedRendererNavigationUrl(
        `${RENDERER_PROTOCOL_ORIGIN}/assets/index.html`,
        packagedEntry,
      ),
    ).toBe(false);
    expect(
      isTrustedRendererNavigationUrl(
        "https://attacker.invalid/",
        packagedEntry,
      ),
    ).toBe(false);

    const developmentEntry = "http://localhost:5173/#/wallet";
    expect(
      isTrustedRendererNavigationUrl(
        "http://localhost:5173/#/settings",
        developmentEntry,
      ),
    ).toBe(true);
    expect(
      isTrustedRendererNavigationUrl(
        "http://127.0.0.1:5173/#/settings",
        developmentEntry,
      ),
    ).toBe(false);
  });
});
