import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildIrohaSdkAliases,
  hasCurrentIrohaSdkApi,
  resolveCompatibleIrohaSdkRoot,
} from "../scripts/iroha-sdk-compat.mjs";

const roots: string[] = [];
const requiredRootExports = [
  "buildTransactionPayload",
  "signQuotedTransactionPayload",
  "buildIvmProvedTransactionPayload",
  "signQuotedIvmProvedTransactionPayload",
  "noritoDecodeInstruction",
  "noritoEncodeInstruction",
  "inspectSubscriptionTriggerAction",
  "computeValidationFeePolicyProposalFingerprintV1",
  "computeValidationFeePayoutLifecycleProposalFingerprintV1",
] as const;
const requiredModules = {
  "@iroha/iroha-js": ["index.js", "index.d.ts"],
  "@iroha/iroha-js/address": ["address.js", "address.d.ts"],
  "@iroha/iroha-js/browser": ["browser.js", "browser.d.ts"],
  "@iroha/iroha-js/canonical-request": [
    "canonicalRequest.js",
    "canonical-request.d.ts",
  ],
  "@iroha/iroha-js/connect-browser": [
    "connect.browser.js",
    "connect.browser.d.ts",
  ],
  "@iroha/iroha-js/crypto": ["crypto.js", "crypto.d.ts"],
  "@iroha/iroha-js/instruction-builders": [
    "instructionBuilders.js",
    "instruction-builders.d.ts",
  ],
  "@iroha/iroha-js/normalizers": ["normalizers.js", "normalizers.d.ts"],
  "@iroha/iroha-js/transaction-codec": [
    "transactionCodec.js",
    "transaction-codec.d.ts",
  ],
} as const;

const makeRoot = (): string => {
  const root = realpathSync.native(
    mkdtempSync(join(tmpdir(), "sora-wallet-sdk-compat-")),
  );
  roots.push(root);
  return root;
};

const writeCurrentSdk = (sdkRoot: string): void => {
  const dist = join(sdkRoot, "dist");
  mkdirSync(dist, { recursive: true });
  for (const [runtimeFilename] of Object.values(requiredModules)) {
    writeFileSync(
      join(dist, runtimeFilename),
      runtimeFilename === "index.js"
        ? `${requiredRootExports
            .map((name) => `export function ${name}() {}`)
            .join("\n")}\n`
        : "export {};\n",
      "utf8",
    );
  }
  for (const [, declarationFilename] of Object.values(requiredModules)) {
    writeFileSync(join(sdkRoot, declarationFilename), "export {};\n", "utf8");
  }
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("Iroha SDK build selection", () => {
  it("resolves and activates one canonical configured SDK root", () => {
    const projectRoot = makeRoot();
    const sdkRoot = join(projectRoot, "sdk");
    writeCurrentSdk(sdkRoot);

    expect(
      resolveCompatibleIrohaSdkRoot({
        env: { IROHA_JS_SDK_ROOT: sdkRoot },
        log: () => undefined,
        projectRoot,
      }),
    ).toBe(sdkRoot);
    expect(
      realpathSync.native(
        join(
          projectRoot,
          "node_modules",
          ".cache",
          "iroha-sdk-compat",
          "active",
        ),
      ),
    ).toBe(sdkRoot);
    expect(hasCurrentIrohaSdkApi(sdkRoot)).toBe(true);
    expect(
      Object.fromEntries(
        buildIrohaSdkAliases(sdkRoot).map(({ find, replacement }) => [
          find,
          replacement,
        ]),
      ),
    ).toEqual(
      Object.fromEntries(
        Object.entries(requiredModules).map(([find, [runtimeFilename]]) => [
          find,
          join(sdkRoot, "dist", runtimeFilename),
        ]),
      ),
    );
  });

  it("rejects symlinked SDK roots and incomplete active module sets", () => {
    const projectRoot = makeRoot();
    const sdkRoot = join(projectRoot, "sdk");
    const sdkLink = join(projectRoot, "sdk-link");
    writeCurrentSdk(sdkRoot);
    symlinkSync(
      sdkRoot,
      sdkLink,
      process.platform === "win32" ? "junction" : "dir",
    );

    expect(() =>
      resolveCompatibleIrohaSdkRoot({
        env: { IROHA_JS_SDK_ROOT: sdkLink },
        log: () => undefined,
        projectRoot,
      }),
    ).toThrow("must be a canonical physical directory");

    rmSync(join(sdkRoot, "normalizers.d.ts"));
    expect(hasCurrentIrohaSdkApi(sdkRoot)).toBe(false);
  });

  it("rejects a configured root whose identity depends on the caller cwd", () => {
    const projectRoot = makeRoot();

    expect(() =>
      resolveCompatibleIrohaSdkRoot({
        env: { IROHA_JS_SDK_ROOT: "relative-sdk" },
        log: () => undefined,
        projectRoot,
      }),
    ).toThrow("must be an explicit absolute path");
  });

  it("does not recursively replace an unowned activation directory", () => {
    const projectRoot = makeRoot();
    const sdkRoot = join(projectRoot, "sdk");
    const activeRoot = join(
      projectRoot,
      "node_modules",
      ".cache",
      "iroha-sdk-compat",
      "active",
    );
    writeCurrentSdk(sdkRoot);
    mkdirSync(activeRoot, { recursive: true });
    writeFileSync(join(activeRoot, "unowned.txt"), "preserve\n", "utf8");

    expect(() =>
      resolveCompatibleIrohaSdkRoot({
        env: { IROHA_JS_SDK_ROOT: sdkRoot },
        log: () => undefined,
        projectRoot,
      }),
    ).toThrow("Refusing to replace non-symlink SDK activation path");
    expect(readFileSync(join(activeRoot, "unowned.txt"), "utf8")).toBe(
      "preserve\n",
    );
  });

  it("keeps every active TypeScript subpath on the selected SDK root", () => {
    const projectRoot = resolve(process.cwd());
    for (const configName of ["tsconfig.json", "tsconfig.node.json"]) {
      const config = JSON.parse(
        readFileSync(join(projectRoot, configName), "utf8"),
      ) as {
        compilerOptions?: { paths?: Record<string, string[]> };
      };
      const paths = config.compilerOptions?.paths ?? {};
      for (const [specifier, [, declarationFilename]] of Object.entries(
        requiredModules,
      )) {
        expect(paths[specifier], `${configName}: ${specifier}`).toEqual([
          `node_modules/.cache/iroha-sdk-compat/active/${declarationFilename}`,
        ]);
      }
    }
  });

  it("resolves the SDK cipher import through the selected SDK dependency closure", () => {
    const projectRoot = resolve(process.cwd());
    const sdkRoot = resolveCompatibleIrohaSdkRoot({
      log: () => undefined,
      projectRoot,
    });
    const importer = join(sdkRoot, "dist", "connect.browser.js");
    const resolvedCipher = createRequire(importer).resolve(
      "@noble/ciphers/chacha",
    );
    const expectedCipher = join(
      sdkRoot,
      "node_modules",
      "@noble",
      "ciphers",
      "chacha.js",
    );

    expect(realpathSync.native(resolvedCipher)).toBe(
      realpathSync.native(expectedCipher),
    );
    expect(
      JSON.parse(
        readFileSync(join(dirname(resolvedCipher), "package.json"), "utf8"),
      ),
    ).toMatchObject({ version: "1.3.0" });

    for (const configName of ["electron.vite.config.ts", "vitest.config.ts"]) {
      const config = readFileSync(join(projectRoot, configName), "utf8");
      expect(config, configName).not.toContain(
        "find: /^@noble\\/ciphers\\/chacha$/u",
      );
      expect(config, configName).not.toContain(
        "node_modules/@noble/ciphers/chacha.js",
      );
    }
  });

  it("keeps Vite, native staging, and postinstall on the shared resolver", () => {
    const projectRoot = resolve(process.cwd());
    const sources = [
      "electron.vite.config.ts",
      "scripts/copy-iroha-native.mjs",
      "scripts/postinstall.mjs",
    ].map((path) => readFileSync(join(projectRoot, path), "utf8"));

    for (const source of sources) {
      expect(source).toContain(
        "resolveCompatibleIrohaSdkRoot({ projectRoot })",
      );
      expect(source).not.toContain('import.meta.resolve("@iroha/iroha-js")');
    }
    expect(sources[0]).not.toContain("process.cwd()");
    expect(sources[1]).not.toContain("process.cwd()");
  });
});
