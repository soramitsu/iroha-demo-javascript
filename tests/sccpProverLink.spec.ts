import { describe, expect, it, vi } from "vitest";
import {
  loadTronSccpProveFn,
  loadTronSccpSourceProveFn,
  normalizeTronSccpProverModuleUrl,
  pickTronSccpProveFn,
  pickTronSccpSourceProveFn,
  type TronSccpProverModule,
} from "@/utils/sccpProverLink";

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
});
