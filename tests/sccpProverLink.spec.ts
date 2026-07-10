import { describe, expect, it, vi } from "vitest";
import { sha256 } from "@noble/hashes/sha256";
import {
  loadBscSccpProveFn,
  loadBscSccpSourceProveFn,
  loadSolanaSccpProveFn,
  loadSolanaSccpSourceProveFn,
  loadTronSccpProveFn,
  loadTronSccpSourceProveFn,
  normalizeTronSccpProverModuleUrl,
  pickBscSccpProveFn,
  pickBscSccpSourceProveFn,
  pickSolanaSccpProveFn,
  pickSolanaSccpSourceProveFn,
  pickTronSccpProveFn,
  pickTronSccpSourceProveFn,
  type BscSccpProverGlobal,
  type SolanaSccpProverModule,
  type TronSccpProverModule,
} from "@/utils/sccpProverLink";

const sha256Hex = (value: string): string =>
  `0x${Array.from(sha256(new TextEncoder().encode(value)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;

describe("SCCP TRON prover linker", () => {
  it("prefers supported module export names before worker globals", () => {
    const moduleFn = vi.fn();
    const globalFn = vi.fn();

    expect(
      pickTronSccpProveFn(
        {
          irohaSccpTronProve: globalFn,
          tronSccpProve: vi.fn(),
        },
        {
          irohaSccpTronProve: moduleFn,
          tronSccpProve: vi.fn(),
          prove: vi.fn(),
          proveFn: vi.fn(),
          default: vi.fn(),
        },
      ),
    ).toBe(moduleFn);
  });

  it("accepts every supported module export shape", () => {
    const exportNames: Array<keyof TronSccpProverModule> = [
      "irohaSccpTronProve",
      "tronSccpProve",
      "prove",
      "proveFn",
      "default",
    ];

    exportNames.forEach((exportName) => {
      const prove = vi.fn();
      expect(pickTronSccpProveFn({}, { [exportName]: prove })).toBe(prove);
    });
  });

  it("accepts every supported BSC destination prover export shape", () => {
    const exportNames: Array<keyof TronSccpProverModule> = [
      "irohaSccpBscProve",
      "bscSccpProve",
      "evmSccpProve",
      "proveBsc",
      "prove",
      "proveFn",
      "default",
    ];

    exportNames.forEach((exportName) => {
      const prove = vi.fn();
      expect(pickBscSccpProveFn({}, { [exportName]: prove })).toBe(prove);
    });
  });

  it("falls back to worker globals when no module function is present", () => {
    const irohaGlobal = vi.fn();
    const tronGlobal = vi.fn();

    expect(
      pickTronSccpProveFn({
        irohaSccpTronProve: irohaGlobal,
        tronSccpProve: tronGlobal,
      }),
    ).toBe(irohaGlobal);

    expect(
      pickTronSccpProveFn({
        tronSccpProve: tronGlobal,
      }),
    ).toBe(tronGlobal);
  });

  it("does not use BSC worker globals when no module function is present", () => {
    const irohaGlobal = vi.fn();
    const bscGlobal = vi.fn();
    const evmGlobal = vi.fn();

    expect(
      pickBscSccpProveFn({
        irohaSccpBscProve: irohaGlobal,
        bscSccpProve: bscGlobal,
        evmSccpProve: evmGlobal,
      }),
    ).toBeUndefined();

    expect(
      pickBscSccpProveFn({
        bscSccpProve: bscGlobal,
      }),
    ).toBeUndefined();
  });

  it("ignores non-function exports and globals", () => {
    expect(
      pickTronSccpProveFn(
        {
          irohaSccpTronProve: "not-a-function",
          tronSccpProve: null,
        },
        {
          irohaSccpTronProve: false,
          tronSccpProve: "not-a-function",
          prove: 1,
          proveFn: {},
          default: [],
        },
      ),
    ).toBeUndefined();
  });

  it("rejects accessor-backed prover exports without invoking them", async () => {
    const accessor = vi.fn(() => vi.fn());
    const bscModule = {};
    Object.defineProperty(bscModule, "proveBsc", {
      enumerable: true,
      get: accessor,
    });

    expect(() =>
      pickBscSccpProveFn({}, bscModule as TronSccpProverModule),
    ).toThrow(/own enumerable data properties/u);
    expect(accessor).not.toHaveBeenCalled();

    const tronGlobalAccessor = vi.fn(() => vi.fn());
    const tronGlobal = {};
    Object.defineProperty(tronGlobal, "tronSccpProve", {
      enumerable: true,
      get: tronGlobalAccessor,
    });

    expect(() => pickTronSccpProveFn(tronGlobal)).toThrow(
      /own enumerable data properties/u,
    );
    expect(tronGlobalAccessor).not.toHaveBeenCalled();

    const importedAccessor = vi.fn(() => vi.fn());
    const importedModule = {};
    Object.defineProperty(importedModule, "default", {
      enumerable: true,
      get: importedAccessor,
    });
    const importer = vi
      .fn<(moduleUrl: string) => Promise<TronSccpProverModule>>()
      .mockResolvedValue(importedModule as TronSccpProverModule);

    await expect(
      loadBscSccpProveFn({
        globalScope: {},
        moduleUrl: "/sccp-bsc-prover.js",
        importer,
      }),
    ).rejects.toThrow(/own enumerable data properties/u);
    expect(importer).toHaveBeenCalledWith("/sccp-bsc-prover.js");
    expect(importedAccessor).not.toHaveBeenCalled();
  });

  it("rejects hidden or inherited prover exports", () => {
    const hiddenModule = {};
    Object.defineProperty(hiddenModule, "proveBsc", {
      value: vi.fn(),
      enumerable: false,
    });

    expect(() =>
      pickBscSccpProveFn({}, hiddenModule as TronSccpProverModule),
    ).toThrow(/own enumerable data properties/u);

    const inheritedModule = Object.create({ proveBsc: vi.fn() });
    expect(
      pickBscSccpProveFn({}, inheritedModule as TronSccpProverModule),
    ).toBeUndefined();
  });

  it("does not import when the module URL is empty", async () => {
    const prove = vi.fn();
    const importer = vi.fn<() => Promise<TronSccpProverModule>>();

    await expect(
      loadTronSccpProveFn({
        globalScope: { irohaSccpTronProve: prove },
        moduleUrl: "  ",
        importer,
      }),
    ).resolves.toBe(prove);
    expect(importer).not.toHaveBeenCalled();
  });

  it("does not use BSC destination globals when the module URL is empty", async () => {
    const prove = vi.fn();
    const importer = vi.fn<() => Promise<TronSccpProverModule>>();

    await expect(
      loadBscSccpProveFn({
        globalScope: { bscSccpProve: prove },
        moduleUrl: "  ",
        importer,
      }),
    ).resolves.toBeUndefined();
    expect(importer).not.toHaveBeenCalled();
  });

  it("imports a configured prover module URL", async () => {
    const prove = vi.fn();
    const importer = vi
      .fn<(moduleUrl: string) => Promise<TronSccpProverModule>>()
      .mockResolvedValue({ prove });

    await expect(
      loadTronSccpProveFn({
        globalScope: {},
        moduleUrl: " https://cdn.example.invalid/sccp-tron-prover.js ",
        importer,
      }),
    ).resolves.toBe(prove);
    expect(importer).toHaveBeenCalledWith(
      "https://cdn.example.invalid/sccp-tron-prover.js",
    );
  });

  it("imports a configured BSC prover module URL", async () => {
    const proveBsc = vi.fn();
    const importer = vi
      .fn<(moduleUrl: string) => Promise<TronSccpProverModule>>()
      .mockResolvedValue({ proveBsc });

    await expect(
      loadBscSccpProveFn({
        globalScope: {},
        moduleUrl: " /sccp-bsc-prover.js ",
        importer,
      }),
    ).resolves.toBe(proveBsc);
    expect(importer).toHaveBeenCalledWith("/sccp-bsc-prover.js");
  });

  it("normalizes only production-safe or local-development prover module URLs", () => {
    expect(
      normalizeTronSccpProverModuleUrl(
        " https://cdn.example.invalid/sccp-tron-prover.js ",
      ),
    ).toBe("https://cdn.example.invalid/sccp-tron-prover.js");
    expect(normalizeTronSccpProverModuleUrl("/sccp-tron-prover.js")).toBe(
      "/sccp-tron-prover.js",
    );
    expect(normalizeTronSccpProverModuleUrl("./sccp-tron-prover.js")).toBe(
      "./sccp-tron-prover.js",
    );
    expect(
      normalizeTronSccpProverModuleUrl(
        "http://127.0.0.1:5173/sccp-tron-prover.js",
      ),
    ).toBe("http://127.0.0.1:5173/sccp-tron-prover.js");

    for (const unsafeUrl of [
      "data:text/javascript,export default ()=>{}",
      "javascript:alert(1)",
      "file:///tmp/sccp-tron-prover.js",
      "http://cdn.example.invalid/sccp-tron-prover.js",
      "//cdn.example.invalid/sccp-tron-prover.js",
      "https://user:pass@cdn.example.invalid/sccp-tron-prover.js",
      "https://cdn.example.invalid/sccp-tron-prover.js?token=secret",
      "https://cdn.example.invalid/sccp-tron-prover.js#debug",
      "/sccp-tron-prover.js?token=secret",
      "./sccp-tron-prover.js#debug",
      "../sccp-tron-prover.js",
      "./../sccp-tron-prover.js",
      "/assets/../sccp-tron-prover.js",
      "https://cdn.example.invalid/assets/../sccp-tron-prover.js",
      "https://cdn.example.invalid/assets/%2e%2e/sccp-tron-prover.js",
      "https://cdn.example.invalid/assets/%252e%252e/sccp-tron-prover.js",
      "https://cdn.example.invalid/assets/%25252e%25252e/sccp-tron-prover.js",
      ".%252e/sccp-tron-prover.js",
      "https://cdn.example.invalid/sccp tron prover.js",
      "cdn.example.invalid/sccp-tron-prover.js",
    ]) {
      expect(() => normalizeTronSccpProverModuleUrl(unsafeUrl)).toThrow(
        /SCCP prover module URL/u,
      );
    }
  });

  it("rejects unsafe destination prover module URLs before importing", async () => {
    const importer = vi.fn<() => Promise<TronSccpProverModule>>();

    await expect(
      loadTronSccpProveFn({
        globalScope: {},
        moduleUrl: "data:text/javascript,export default ()=>{}",
        importer,
      }),
    ).rejects.toThrow(/SCCP prover module URL/u);
    expect(importer).not.toHaveBeenCalled();

    await expect(
      loadTronSccpProveFn({
        globalScope: {},
        moduleUrl: "/sccp-tron-prover.js?token=secret",
        importer,
      }),
    ).rejects.toThrow(/query strings or fragments/u);
    expect(importer).not.toHaveBeenCalled();
  });

  it("rejects unsafe BSC prover module URLs before importing", async () => {
    const importer = vi.fn<() => Promise<TronSccpProverModule>>();

    await expect(
      loadBscSccpProveFn({
        globalScope: {},
        moduleUrl: "../sccp-bsc-prover.js",
        importer,
      }),
    ).rejects.toThrow(/SCCP prover module URL/u);
    expect(importer).not.toHaveBeenCalled();

    await expect(
      loadBscSccpProveFn({
        globalScope: {},
        moduleUrl: "file:///tmp/sccp-bsc-prover.js",
        importer,
      }),
    ).rejects.toThrow(/SCCP prover module URL/u);
    expect(importer).not.toHaveBeenCalled();
  });

  it("propagates prover module import failures", async () => {
    const importer = vi
      .fn<(moduleUrl: string) => Promise<TronSccpProverModule>>()
      .mockRejectedValue(new Error("load failed"));

    await expect(
      loadTronSccpProveFn({
        globalScope: {},
        moduleUrl: "/missing-prover.js",
        importer,
      }),
    ).rejects.toThrow("load failed");
  });

  it("picks supported TRON source prover export names", () => {
    const exportNames: Array<keyof TronSccpProverModule> = [
      "irohaSccpTronSourceProve",
      "tronSccpSourceProve",
      "proveTronSource",
    ];

    exportNames.forEach((exportName) => {
      const prove = vi.fn();
      expect(pickTronSccpSourceProveFn({}, { [exportName]: prove })).toBe(
        prove,
      );
    });
  });

  it("picks supported BSC source prover export names", () => {
    const exportNames: Array<keyof TronSccpProverModule> = [
      "irohaSccpBscSourceProve",
      "bscSccpSourceProve",
      "proveBscSource",
    ];

    exportNames.forEach((exportName) => {
      const prove = vi.fn();
      expect(pickBscSccpSourceProveFn({}, { [exportName]: prove })).toBe(prove);
    });
  });

  it("rejects accessor-backed source prover exports without invoking them", () => {
    const tronSourceAccessor = vi.fn(() => vi.fn());
    const tronSourceModule = {};
    Object.defineProperty(tronSourceModule, "proveTronSource", {
      enumerable: true,
      get: tronSourceAccessor,
    });

    expect(() =>
      pickTronSccpSourceProveFn({}, tronSourceModule as TronSccpProverModule),
    ).toThrow(/own enumerable data properties/u);
    expect(tronSourceAccessor).not.toHaveBeenCalled();

    const bscSourceAccessor = vi.fn(() => vi.fn());
    const bscSourceModule = {};
    Object.defineProperty(bscSourceModule, "proveBscSource", {
      enumerable: true,
      get: bscSourceAccessor,
    });

    expect(() =>
      pickBscSccpSourceProveFn({}, bscSourceModule as TronSccpProverModule),
    ).toThrow(/own enumerable data properties/u);
    expect(bscSourceAccessor).not.toHaveBeenCalled();
  });

  it("falls back to TRON source prover worker globals", () => {
    const irohaGlobal = vi.fn();
    const tronGlobal = vi.fn();

    expect(
      pickTronSccpSourceProveFn({
        irohaSccpTronSourceProve: irohaGlobal,
        tronSccpSourceProve: tronGlobal,
      }),
    ).toBe(irohaGlobal);

    expect(
      pickTronSccpSourceProveFn({
        tronSccpSourceProve: tronGlobal,
      }),
    ).toBe(tronGlobal);
  });

  it("does not use BSC source prover worker globals", () => {
    const irohaGlobal = vi.fn();
    const bscGlobal = vi.fn();
    const adversarialIrohaGlobal = {
      irohaSccpBscSourceProve: irohaGlobal,
      bscSccpSourceProve: bscGlobal,
    } as unknown as BscSccpProverGlobal;
    const adversarialBscGlobal = {
      bscSccpSourceProve: bscGlobal,
    } as unknown as BscSccpProverGlobal;

    expect(pickBscSccpSourceProveFn(adversarialIrohaGlobal)).toBeUndefined();

    expect(pickBscSccpSourceProveFn(adversarialBscGlobal)).toBeUndefined();
  });

  it("imports a configured TRON source prover module URL", async () => {
    const proveTronSource = vi.fn();
    const importer = vi
      .fn<(moduleUrl: string) => Promise<TronSccpProverModule>>()
      .mockResolvedValue({ proveTronSource });

    await expect(
      loadTronSccpSourceProveFn({
        globalScope: {},
        moduleUrl: " /sccp-tron-source-prover.js ",
        importer,
      }),
    ).resolves.toBe(proveTronSource);
    expect(importer).toHaveBeenCalledWith("/sccp-tron-source-prover.js");
  });

  it("imports a configured BSC source prover module URL", async () => {
    const proveBscSource = vi.fn();
    const importer = vi
      .fn<(moduleUrl: string) => Promise<TronSccpProverModule>>()
      .mockResolvedValue({ proveBscSource });

    await expect(
      loadBscSccpSourceProveFn({
        globalScope: {},
        moduleUrl: " /sccp-bsc-source-prover.js ",
        importer,
      }),
    ).resolves.toBe(proveBscSource);
    expect(importer).toHaveBeenCalledWith("/sccp-bsc-source-prover.js");
  });

  it("verifies Solana destination prover module bytes before importing", async () => {
    const moduleBytes = "export const proveSolanaSccpDestination = () => ({});";
    const proveSolanaSccpDestination = vi.fn();
    const importer = vi
      .fn<(moduleUrl: string) => Promise<SolanaSccpProverModule>>()
      .mockResolvedValue({ proveSolanaSccpDestination });
    const moduleBytesFetcher = vi.fn().mockResolvedValue(moduleBytes);

    await expect(
      loadSolanaSccpProveFn({
        globalScope: {},
        moduleUrl: " /sccp-solana/destination-prover.js ",
        moduleHash: sha256Hex(moduleBytes),
        moduleBytesFetcher,
        importer,
      }),
    ).resolves.toBe(proveSolanaSccpDestination);
    expect(moduleBytesFetcher).toHaveBeenCalledWith(
      "/sccp-solana/destination-prover.js",
    );
    expect(importer).toHaveBeenCalledTimes(1);
    const immutableImportUrl = importer.mock.calls[0]?.[0] ?? "";
    expect(immutableImportUrl).toMatch(/^data:text\/javascript;base64,/u);
    expect(
      Buffer.from(immutableImportUrl.split(",", 2)[1] ?? "", "base64").toString(
        "utf8",
      ),
    ).toBe(moduleBytes);
    expect(immutableImportUrl).not.toContain("/sccp-solana/");
  });

  it("executes the exact verified Solana bytes without re-importing the network URL", async () => {
    const marker = `verified-${Date.now()}-${Math.random()}`;
    const moduleBytes = `export const proveSolanaSccpDestination = () => ${JSON.stringify(marker)};`;
    const moduleBytesFetcher = vi.fn().mockResolvedValue(moduleBytes);

    const prove = await loadSolanaSccpProveFn({
      globalScope: { irohaSccpSolanaProve: vi.fn() },
      moduleUrl: "https://prover.example.invalid/destination.js",
      moduleHash: sha256Hex(moduleBytes),
      moduleBytesFetcher,
    });

    expect(prove).toBeTypeOf("function");
    expect(await prove?.({} as never)).toBe(marker);
    expect(moduleBytesFetcher).toHaveBeenCalledTimes(1);
    expect(moduleBytesFetcher).toHaveBeenCalledWith(
      "https://prover.example.invalid/destination.js",
    );
  });

  it("requires both governed Solana module URLs and hashes", async () => {
    const importer = vi.fn();
    const moduleBytesFetcher = vi.fn();

    await expect(
      loadSolanaSccpProveFn({
        globalScope: { irohaSccpSolanaProve: vi.fn() },
        moduleHash: `0x${"11".repeat(32)}`,
        importer,
        moduleBytesFetcher,
      }),
    ).rejects.toThrow(/destination prover module URL is required/u);
    await expect(
      loadSolanaSccpSourceProveFn({
        globalScope: { solanaSccpSourceProve: vi.fn() },
        moduleUrl: "/sccp-solana/source-prover.js",
        importer,
        moduleBytesFetcher,
      }),
    ).rejects.toThrow(/source prover module hash is required/u);
    expect(moduleBytesFetcher).not.toHaveBeenCalled();
    expect(importer).not.toHaveBeenCalled();
  });

  it("uses only the exact governed Solana prover exports", () => {
    const destination = vi.fn();
    const source = vi.fn();
    expect(
      pickSolanaSccpProveFn(
        { irohaSccpSolanaProve: vi.fn(), solanaSccpProve: vi.fn() },
        { proveSolanaSccpDestination: destination },
      ),
    ).toBe(destination);
    expect(
      pickSolanaSccpSourceProveFn(
        {
          irohaSccpSolanaSourceProve: vi.fn(),
          solanaSccpSourceProve: vi.fn(),
        },
        { proveSolanaSccpSource: source },
      ),
    ).toBe(source);

    for (const legacyDestinationExport of [
      "irohaSccpSolanaProve",
      "solanaSccpProve",
      "proveSolana",
      "prove",
      "proveFn",
      "default",
    ] as const) {
      expect(
        pickSolanaSccpProveFn(
          { irohaSccpSolanaProve: vi.fn(), solanaSccpProve: vi.fn() },
          { [legacyDestinationExport]: vi.fn() },
        ),
      ).toBeUndefined();
    }
    for (const legacySourceExport of [
      "irohaSccpSolanaSourceProve",
      "solanaSccpSourceProve",
      "proveSolanaSource",
    ] as const) {
      expect(
        pickSolanaSccpSourceProveFn(
          {
            irohaSccpSolanaSourceProve: vi.fn(),
            solanaSccpSourceProve: vi.fn(),
          },
          { [legacySourceExport]: vi.fn() },
        ),
      ).toBeUndefined();
    }
  });

  it("rejects Solana source prover module hash mismatches before importing", async () => {
    const importer = vi
      .fn<(moduleUrl: string) => Promise<SolanaSccpProverModule>>()
      .mockResolvedValue({ proveSolanaSccpSource: vi.fn() });
    const moduleBytesFetcher = vi
      .fn()
      .mockResolvedValue("export const proveSolanaSccpSource = () => ({});");

    await expect(
      loadSolanaSccpSourceProveFn({
        globalScope: {},
        moduleUrl: "/sccp-solana/source-prover.js",
        moduleHash: `0x${"00".repeat(32)}`,
        moduleBytesFetcher,
        importer,
      }),
    ).rejects.toThrow(/SCCP prover module hash mismatch/u);
    expect(moduleBytesFetcher).toHaveBeenCalledWith(
      "/sccp-solana/source-prover.js",
    );
    expect(importer).not.toHaveBeenCalled();
  });

  it("does not import an empty TRON source prover URL", async () => {
    const prove = vi.fn();
    const importer = vi.fn<() => Promise<TronSccpProverModule>>();

    await expect(
      loadTronSccpSourceProveFn({
        globalScope: { tronSccpSourceProve: prove },
        moduleUrl: "",
        importer,
      }),
    ).resolves.toBe(prove);
    expect(importer).not.toHaveBeenCalled();
  });

  it("does not use BSC source globals for an empty prover URL", async () => {
    const prove = vi.fn();
    const importer = vi.fn<() => Promise<TronSccpProverModule>>();

    await expect(
      loadBscSccpSourceProveFn({
        globalScope: {
          bscSccpSourceProve: prove,
        } as unknown as BscSccpProverGlobal,
        moduleUrl: "",
        importer,
      }),
    ).resolves.toBeUndefined();
    expect(importer).not.toHaveBeenCalled();
  });

  it("rejects unsafe TRON source prover module URLs before importing", async () => {
    const importer = vi.fn<() => Promise<TronSccpProverModule>>();

    await expect(
      loadTronSccpSourceProveFn({
        globalScope: {},
        moduleUrl: "http://cdn.example.invalid/sccp-tron-source-prover.js",
        importer,
      }),
    ).rejects.toThrow(/SCCP prover module URL/u);
    expect(importer).not.toHaveBeenCalled();
  });

  it("rejects unsafe BSC source prover module URLs before importing", async () => {
    const importer = vi.fn<() => Promise<TronSccpProverModule>>();

    await expect(
      loadBscSccpSourceProveFn({
        globalScope: {},
        moduleUrl:
          "https://cdn.example.invalid/assets/%252e%252e/sccp-bsc-source-prover.js",
        importer,
      }),
    ).rejects.toThrow(/SCCP prover module URL/u);
    expect(importer).not.toHaveBeenCalled();
  });
});
