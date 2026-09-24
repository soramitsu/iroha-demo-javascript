import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  GOVERNANCE_VALIDATION_FEE_FINALITY_FILENAME,
  GOVERNANCE_VALIDATION_FEE_FINALITY_MARKER_FILENAME,
  GOVERNANCE_VALIDATION_FEE_FINALITY_MARKER_SCHEMA,
  GOVERNANCE_VALIDATION_FEE_FINALITY_SCHEMA,
  GOVERNANCE_VALIDATION_FEE_POLICY_IPC_CHANNEL,
  GovernanceValidationFeeFinalityStore,
  assertGovernanceValidationFeeTrustedSender,
  governanceValidationFeeFinalityMarkerPath,
  governanceValidationFeeFinalityPath,
  type GovernanceValidationFeeImmutableLedgerScope,
} from "../electron/governanceValidationFeeFinality";
import type { GovernanceValidationFeeFinalityObservation } from "../electron/governanceValidationFee";
import {
  GOVERNANCE_INTEGRITY_DIRECTORY_NAME,
  governanceIntegrityDirectoryPath,
  secureWriteBoundedFile,
} from "../electron/secureBoundedJson";

const immutableScope = (
  value = "12".repeat(32),
): GovernanceValidationFeeImmutableLedgerScope =>
  value as GovernanceValidationFeeImmutableLedgerScope;

const observation = (
  overrides: Partial<GovernanceValidationFeeFinalityObservation> = {},
): GovernanceValidationFeeFinalityObservation => ({
  ledgerFinalisedHeight: 126_000,
  contextId: "33".repeat(32),
  blockHash: "55".repeat(32),
  policyVersion: 1,
  policyHash: "99".repeat(32),
  projectionHash: "ab".repeat(32),
  ...overrides,
});

describe("durable governance validation-fee finality", () => {
  const temporaryDirectories: string[] = [];

  const temporaryDirectory = (): string => {
    const path = realpathSync.native(
      mkdtempSync(join(tmpdir(), "governance-validation-fee-finality-")),
    );
    temporaryDirectories.push(path);
    return path;
  };

  afterEach(() => {
    for (const path of temporaryDirectories.splice(0)) {
      rmSync(path, { recursive: true, force: true });
    }
  });

  it("atomically initializes exact private state and marker files", () => {
    const userDataPath = temporaryDirectory();
    const statePath = governanceValidationFeeFinalityPath(userDataPath);
    const markerPath = governanceValidationFeeFinalityMarkerPath(userDataPath);
    new GovernanceValidationFeeFinalityStore(userDataPath).verifyAndPromote(
      immutableScope(),
      observation(),
    );

    expect(statePath).toBe(
      join(
        userDataPath,
        GOVERNANCE_INTEGRITY_DIRECTORY_NAME,
        GOVERNANCE_VALIDATION_FEE_FINALITY_FILENAME,
      ),
    );
    expect(markerPath).toBe(
      join(
        userDataPath,
        GOVERNANCE_INTEGRITY_DIRECTORY_NAME,
        GOVERNANCE_VALIDATION_FEE_FINALITY_MARKER_FILENAME,
      ),
    );
    if (process.platform !== "win32") {
      expect(statSync(statePath).mode & 0o777).toBe(0o600);
      expect(statSync(markerPath).mode & 0o777).toBe(0o600);
      expect(
        statSync(governanceIntegrityDirectoryPath(userDataPath)).mode & 0o777,
      ).toBe(0o700);
    }
    expect(readdirSync(userDataPath)).toEqual([
      GOVERNANCE_INTEGRITY_DIRECTORY_NAME,
    ]);
    expect(
      readdirSync(governanceIntegrityDirectoryPath(userDataPath)).sort(),
    ).toEqual(
      [
        GOVERNANCE_VALIDATION_FEE_FINALITY_FILENAME,
        GOVERNANCE_VALIDATION_FEE_FINALITY_MARKER_FILENAME,
      ].sort(),
    );
    const state = JSON.parse(readFileSync(statePath, "utf8")) as {
      schema: string;
      observations: Record<string, unknown>;
    };
    expect(state.schema).toBe(GOVERNANCE_VALIDATION_FEE_FINALITY_SCHEMA);
    expect(Object.keys(state.observations)).toEqual([immutableScope()]);
    expect(readFileSync(statePath, "utf8")).toBe(JSON.stringify(state));
    expect(JSON.parse(readFileSync(markerPath, "utf8"))).toEqual({
      schema: GOVERNANCE_VALIDATION_FEE_FINALITY_MARKER_SCHEMA,
      state_schema: GOVERNANCE_VALIDATION_FEE_FINALITY_SCHEMA,
    });
  });

  it("rejects rollback and equivocation after a store restart", () => {
    const userDataPath = temporaryDirectory();
    const statePath = governanceValidationFeeFinalityPath(userDataPath);
    new GovernanceValidationFeeFinalityStore(userDataPath).verifyAndPromote(
      immutableScope(),
      observation({ ledgerFinalisedHeight: 126_010 }),
    );
    const stableBytes = readFileSync(statePath);

    expect(() =>
      new GovernanceValidationFeeFinalityStore(userDataPath).verifyAndPromote(
        immutableScope(),
        observation({ ledgerFinalisedHeight: 126_009 }),
      ),
    ).toThrow(/regressed behind a previously verified durable state/);
    expect(readFileSync(statePath)).toEqual(stableBytes);

    expect(() =>
      new GovernanceValidationFeeFinalityStore(userDataPath).verifyAndPromote(
        immutableScope(),
        observation({
          ledgerFinalisedHeight: 126_010,
          contextId: "35".repeat(32),
          projectionHash: "ad".repeat(32),
        }),
      ),
    ).toThrow(/equivocated at an already verified durable height/);
    expect(readFileSync(statePath)).toEqual(stableBytes);
  });

  it("keeps an in-process monotonic floor if state is reset or both files disappear", () => {
    const resetDirectory = temporaryDirectory();
    const resetPath = governanceValidationFeeFinalityPath(resetDirectory);
    const resetStore = new GovernanceValidationFeeFinalityStore(resetDirectory);
    resetStore.verifyAndPromote(
      immutableScope(),
      observation({ ledgerFinalisedHeight: 126_010 }),
    );
    const reset = JSON.parse(readFileSync(resetPath, "utf8")) as {
      observations: Record<string, { ledgerFinalisedHeight: number }>;
    };
    reset.observations[immutableScope()]!.ledgerFinalisedHeight = 126_009;
    writeFileSync(resetPath, JSON.stringify(reset), { mode: 0o600 });
    expect(() =>
      resetStore.verifyAndPromote(
        immutableScope(),
        observation({ ledgerFinalisedHeight: 126_011 }),
      ),
    ).toThrow(/regressed behind a previously verified durable state/);

    const deletedDirectory = temporaryDirectory();
    const deletedStore = new GovernanceValidationFeeFinalityStore(
      deletedDirectory,
    );
    deletedStore.verifyAndPromote(immutableScope(), observation());
    unlinkSync(governanceValidationFeeFinalityPath(deletedDirectory));
    unlinkSync(governanceValidationFeeFinalityMarkerPath(deletedDirectory));
    expect(() =>
      deletedStore.verifyAndPromote(
        immutableScope(),
        observation({ ledgerFinalisedHeight: 126_001 }),
      ),
    ).toThrow(/disappeared after initialization/);
  });

  it("fails closed after restart if either initialized file disappears", () => {
    for (const missing of ["state", "marker"] as const) {
      const userDataPath = temporaryDirectory();
      new GovernanceValidationFeeFinalityStore(userDataPath).verifyAndPromote(
        immutableScope(),
        observation(),
      );
      unlinkSync(
        missing === "state"
          ? governanceValidationFeeFinalityPath(userDataPath)
          : governanceValidationFeeFinalityMarkerPath(userDataPath),
      );

      expect(() =>
        new GovernanceValidationFeeFinalityStore(userDataPath).verifyAndPromote(
          immutableScope(),
          observation({ ledgerFinalisedHeight: 126_001 }),
        ),
      ).toThrow(/incomplete or disappeared after initialization/);
    }
  });

  it("persists a forward promotion and leaves exact repeats untouched", () => {
    const userDataPath = temporaryDirectory();
    const statePath = governanceValidationFeeFinalityPath(userDataPath);
    const markerPath = governanceValidationFeeFinalityMarkerPath(userDataPath);
    const store = new GovernanceValidationFeeFinalityStore(userDataPath);
    store.verifyAndPromote(immutableScope(), observation());
    store.verifyAndPromote(
      immutableScope(),
      observation({
        ledgerFinalisedHeight: 126_001,
        contextId: "35".repeat(32),
        blockHash: "57".repeat(32),
        projectionHash: "ad".repeat(32),
      }),
    );
    const stateBefore = statSync(statePath);
    const markerBefore = statSync(markerPath);
    const bytesBefore = readFileSync(statePath);

    new GovernanceValidationFeeFinalityStore(userDataPath).verifyAndPromote(
      immutableScope(),
      observation({
        ledgerFinalisedHeight: 126_001,
        contextId: "35".repeat(32),
        blockHash: "57".repeat(32),
        projectionHash: "ad".repeat(32),
      }),
    );

    expect(statSync(statePath).ino).toBe(stateBefore.ino);
    expect(statSync(markerPath).ino).toBe(markerBefore.ino);
    expect(readFileSync(statePath)).toEqual(bytesBefore);
  });

  it("fails closed on corrupt, noncanonical, non-private, or linked state", () => {
    const corruptDirectory = temporaryDirectory();
    const corruptPath = governanceValidationFeeFinalityPath(corruptDirectory);
    const corruptMarker =
      governanceValidationFeeFinalityMarkerPath(corruptDirectory);
    secureWriteBoundedFile(corruptPath, Buffer.from("{", "utf8"), {
      label: "Corrupt validation-fee finality state",
      maximumBytes: 256 * 1024,
    });
    secureWriteBoundedFile(
      corruptMarker,
      Buffer.from(
        JSON.stringify({
          schema: GOVERNANCE_VALIDATION_FEE_FINALITY_MARKER_SCHEMA,
          state_schema: GOVERNANCE_VALIDATION_FEE_FINALITY_SCHEMA,
        }),
        "utf8",
      ),
      {
        label: "Corrupt validation-fee finality marker",
        maximumBytes: 4 * 1024,
      },
    );
    expect(() =>
      new GovernanceValidationFeeFinalityStore(
        corruptDirectory,
      ).verifyAndPromote(immutableScope(), observation()),
    ).toThrow(/not unambiguous strict JSON/);

    const noncanonicalDirectory = temporaryDirectory();
    const noncanonicalStore = new GovernanceValidationFeeFinalityStore(
      noncanonicalDirectory,
    );
    noncanonicalStore.verifyAndPromote(immutableScope(), observation());
    const noncanonicalPath = governanceValidationFeeFinalityPath(
      noncanonicalDirectory,
    );
    const parsed = JSON.parse(readFileSync(noncanonicalPath, "utf8"));
    writeFileSync(noncanonicalPath, JSON.stringify(parsed, null, 2), {
      mode: 0o600,
    });
    expect(() =>
      new GovernanceValidationFeeFinalityStore(
        noncanonicalDirectory,
      ).verifyAndPromote(
        immutableScope(),
        observation({ ledgerFinalisedHeight: 126_001 }),
      ),
    ).toThrow(/not in its exact canonical encoding/);

    if (process.platform !== "win32") {
      writeFileSync(noncanonicalPath, JSON.stringify(parsed), { mode: 0o600 });
      chmodSync(noncanonicalPath, 0o644);
      expect(() =>
        new GovernanceValidationFeeFinalityStore(
          noncanonicalDirectory,
        ).verifyAndPromote(
          immutableScope(),
          observation({ ledgerFinalisedHeight: 126_001 }),
        ),
      ).toThrow(/private|mode|protection/u);
    }

    if (process.platform !== "win32") {
      const linkedDirectory = temporaryDirectory();
      const linkedPath = governanceValidationFeeFinalityPath(linkedDirectory);
      const targetPath = join(
        governanceIntegrityDirectoryPath(linkedDirectory),
        "target.json",
      );
      secureWriteBoundedFile(targetPath, Buffer.from("{}", "utf8"), {
        label: "Linked validation-fee finality target",
        maximumBytes: 256 * 1024,
      });
      symlinkSync(targetPath, linkedPath);
      secureWriteBoundedFile(
        governanceValidationFeeFinalityMarkerPath(linkedDirectory),
        Buffer.from(
          JSON.stringify({
            schema: GOVERNANCE_VALIDATION_FEE_FINALITY_MARKER_SCHEMA,
            state_schema: GOVERNANCE_VALIDATION_FEE_FINALITY_SCHEMA,
          }),
          "utf8",
        ),
        {
          label: "Linked validation-fee finality marker",
          maximumBytes: 4 * 1024,
        },
      );
      expect(() =>
        new GovernanceValidationFeeFinalityStore(
          linkedDirectory,
        ).verifyAndPromote(immutableScope(), observation()),
      ).toThrow(/link|indirect|reparse|symbolic/u);
    }
  });

  it("fails closed at capacity without evicting an existing watermark", () => {
    const userDataPath = temporaryDirectory();
    const store = new GovernanceValidationFeeFinalityStore(userDataPath);
    const scopeHash = (
      index: number,
    ): GovernanceValidationFeeImmutableLedgerScope =>
      immutableScope(
        createHash("sha256").update(`ledger-${index}`, "utf8").digest("hex"),
      );
    for (let index = 0; index < 64; index += 1) {
      store.verifyAndPromote(scopeHash(index), observation());
    }

    expect(() => store.verifyAndPromote(scopeHash(64), observation())).toThrow(
      /cannot discard a durable immutable ledger scope/,
    );
    expect(() =>
      store.verifyAndPromote(
        scopeHash(0),
        observation({ ledgerFinalisedHeight: 125_999 }),
      ),
    ).toThrow(/regressed behind a previously verified durable state/);
  }, 15_000);

  it("accepts only the trusted top-level frame with no renderer payload", () => {
    const topFrame = { url: "iroha-app://renderer/index.html#/parliament" };
    expect(() =>
      assertGovernanceValidationFeeTrustedSender({
        ownerMatchesMainWindow: true,
        ownerDestroyed: false,
        senderFrame: topFrame,
        mainFrame: topFrame,
        trustedRendererUrl: "iroha-app://renderer/index.html",
        requestPayload: undefined,
      }),
    ).not.toThrow();

    const assetFrame = {
      url: "iroha-app://renderer/assets/index.js#/parliament",
    };
    const queryFrame = {
      url: "iroha-app://renderer/index.html?debug=1#/parliament",
    };
    for (const rejected of [
      {
        ownerMatchesMainWindow: false,
        senderFrame: topFrame,
        mainFrame: topFrame,
      },
      {
        ownerMatchesMainWindow: true,
        senderFrame: { url: topFrame.url },
        mainFrame: topFrame,
      },
      {
        ownerMatchesMainWindow: true,
        senderFrame: { url: "https://attacker.example" },
        mainFrame: topFrame,
      },
      {
        ownerMatchesMainWindow: true,
        senderFrame: assetFrame,
        mainFrame: assetFrame,
      },
      {
        ownerMatchesMainWindow: true,
        senderFrame: queryFrame,
        mainFrame: queryFrame,
      },
    ]) {
      expect(() =>
        assertGovernanceValidationFeeTrustedSender({
          ownerDestroyed: false,
          trustedRendererUrl: "iroha-app://renderer/index.html",
          requestPayload: undefined,
          ...rejected,
        }),
      ).toThrow(/trusted top-level wallet frame/);
    }

    expect(() =>
      assertGovernanceValidationFeeTrustedSender({
        ownerMatchesMainWindow: true,
        ownerDestroyed: false,
        senderFrame: topFrame,
        mainFrame: topFrame,
        trustedRendererUrl: "iroha-app://renderer/index.html",
        requestPayload: {
          trustScopeHash: "12".repeat(32),
          ledgerFinalisedHeight: Number.MAX_SAFE_INTEGER,
        },
      }),
    ).toThrow(/do not accept renderer-supplied finality data/);
  });

  it("keeps scope derivation and finality promotion in main, not renderer IPC", () => {
    const main = readFileSync(
      resolve(process.cwd(), "electron/main.ts"),
      "utf8",
    );
    const preload = readFileSync(
      resolve(process.cwd(), "electron/preload.ts"),
      "utf8",
    );

    expect(GOVERNANCE_VALIDATION_FEE_POLICY_IPC_CHANNEL).toBe(
      "governance:getCurrentValidationFeePolicy",
    );
    expect(main).toContain("assertGovernanceValidationFeeTrustedSender({");
    expect(main).toContain("fetchGovernanceValidationFeePolicyInMain({");
    expect(main).toContain(
      "finalityStore: governanceValidationFeeFinalityStore",
    );
    expect(main).toContain("fetcher: nodeFetch");
    expect(preload).toContain(
      "parseGovernanceValidationFeePolicyView(\n    await ipcRenderer.invoke(GOVERNANCE_VALIDATION_FEE_POLICY_IPC_CHANNEL)",
    );
    expect(preload).not.toContain("promoteValidationFeeFinality");
    expect(preload).not.toContain("trustScopeHash");
    expect(preload).not.toContain("fetchCoreGovernanceValidationFeePolicy");
  });
});
