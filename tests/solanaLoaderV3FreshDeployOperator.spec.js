// @vitest-environment node
/* global BigInt */

import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair, PublicKey } from "@solana/web3.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveCompatibleIrohaSdkRoot } from "../scripts/iroha-sdk-compat.mjs";
import {
  DEFAULT_SOLANA_LOADER_V3_FRESH_DEPLOY_RPC_URL,
  SOLANA_LOADER_V3_FRESH_DEPLOY_CONTEXT_SCHEMA,
  assertSolanaLoaderV3FreshDeployOperatorPaths,
  canonicalSolanaLoaderV3FreshDeployOperatorConfirmationBytes,
  canonicalSolanaLoaderV3FreshDeployOperatorJsonBytes,
  createDurableSolanaLoaderV3FreshDeployJournalAdapter,
  parseSolanaLoaderV3FreshDeployOperatorArgs,
  runSolanaLoaderV3FreshDeployOperator,
  runSolanaLoaderV3FreshDeployOperatorCli,
  snapshotSolanaLoaderV3FreshDeployContext,
} from "../scripts/solana-loader-v3-fresh-deploy-operator.mjs";
import {
  SOLANA_FEATURE_PROGRAM_ID,
  SOLANA_LOADER_V3_FRESH_DEPLOY_CONFIRMATION_SCHEMA,
  SOLANA_LOADER_V3_FRESH_DEPLOY_JOURNAL_EVENT_SCHEMA,
  SOLANA_LOADER_V3_FRESH_DEPLOY_PLAN_SCHEMA,
  SOLANA_LOADER_V3_FRESH_SBF_ARCHITECTURE,
  SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_POLICY_SHA256,
  SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_ID,
  SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_VERSION,
  SOLANA_SBPF_V3_ENABLE_FEATURE_ID,
  SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER,
  SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER,
  canonicalSolanaLoaderV3FreshDeployPlanBytes,
} from "../scripts/solana-loader-v3-fresh-deploy.mjs";
import { pinSolanaExactOutputDirectory } from "../scripts/sccp-solana-exact-initialize.mjs";
import {
  SOLANA_TESTNET_GENESIS_HASH,
  SOLANA_TESTNET_NETWORK,
  SOLANA_UPGRADEABLE_LOADER_ID,
  solanaSha256,
} from "../scripts/solana-loader-v3-runtime.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const operatorScript = path.join(
  repoRoot,
  "scripts/solana-loader-v3-fresh-deploy-operator.mjs",
);
const explicitlySelectedIrohaSdkRoot = String(
  process.env.IROHA_JS_SDK_ROOT ?? "",
).trim();
const selectedIrohaSdkRoot = realpathSync(
  explicitlySelectedIrohaSdkRoot ||
    resolveCompatibleIrohaSdkRoot({
      projectRoot: repoRoot,
      log: () => {},
    }),
);
const irohaSdkNodeRegister = path.join(
  repoRoot,
  "scripts/iroha-sdk-node-register.mjs",
);
const LOADER = new PublicKey(SOLANA_UPGRADEABLE_LOADER_ID);
const FEATURE_OWNER = new PublicKey(SOLANA_FEATURE_PROGRAM_ID);
const roots = [];

const hashBytes = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;
const hashLabel = (label) => hashBytes(Buffer.from(label, "utf8"));

const featureData = (activationSlot = 50) => {
  const bytes = Buffer.alloc(9);
  bytes[0] = 1;
  bytes.writeBigUInt64LE(BigInt(activationSlot), 1);
  return bytes;
};

const makeConnection = ({
  genesisHash = SOLANA_TESTNET_GENESIS_HASH,
  slot = 100,
  coreVersion = "2.1.0",
  featureSet = 123,
  activationSlot = 50,
  featureOwner = FEATURE_OWNER,
} = {}) => {
  const data = featureData(activationSlot);
  return {
    getGenesisHash: vi.fn(async () => genesisHash),
    getVersion: vi.fn(async () => ({
      "solana-core": coreVersion,
      "feature-set": featureSet,
    })),
    getSlot: vi.fn(async () => slot),
    getAccountInfoAndContext: vi.fn(async () => ({
      context: { slot },
      value: {
        data,
        executable: false,
        owner: featureOwner,
      },
    })),
  };
};

const contextValue = ({
  rpcUrl = DEFAULT_SOLANA_LOADER_V3_FRESH_DEPLOY_RPC_URL,
  finalizedSlot = 100,
  expiresAtFinalizedSlot = 2_000,
  coreVersion = "2.1.0",
  featureSet = 123,
  activationSlot = 50,
} = {}) => ({
  schema: SOLANA_LOADER_V3_FRESH_DEPLOY_CONTEXT_SCHEMA,
  network: SOLANA_TESTNET_NETWORK,
  genesisHash: SOLANA_TESTNET_GENESIS_HASH,
  rpcUrl,
  capturedAt: "2026-07-19T00:00:00.000Z",
  reviewedContext: {
    network: SOLANA_TESTNET_NETWORK,
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    finalizedSlot,
    expiresAtFinalizedSlot,
    solanaCoreVersion: coreVersion,
    featureSet,
    sbpfV3EnableFeatureId: SOLANA_SBPF_V3_ENABLE_FEATURE_ID,
    sbpfV3EnableFeatureActivationSlot: activationSlot,
    sbpfV3EnableFeatureAccountDataSha256: solanaSha256(
      featureData(activationSlot),
    ),
  },
});

const makeRoot = async (label = "operator") => {
  const root = await mkdtemp(
    path.join(await realpath(repoRoot), `.tmp-sccp-solana-${label}-`),
  );
  roots.push(root);
  return root;
};

const writePrivate = async (target, bytes) => {
  await writeFile(target, bytes, { mode: 0o600 });
  await chmod(target, 0o600);
};

const collectFiles = async (root) => {
  const values = [];
  const visit = async (directory) => {
    for (const name of await readdir(directory)) {
      const target = path.join(directory, name);
      const stats = await lstat(target);
      if (stats.isDirectory()) await visit(target);
      else if (stats.isFile()) values.push(await readFile(target));
    }
  };
  await visit(root);
  return Buffer.concat(values);
};

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
  vi.restoreAllMocks();
});

const staticCeremonyOptions = () => ({
  "solana-rpc-url": DEFAULT_SOLANA_LOADER_V3_FRESH_DEPLOY_RPC_URL,
  context: "context.json",
  "expected-context-sha256": hashLabel("context"),
  "native-verifier-artifact": "native.so",
  "native-verifier-artifact-sha256": hashLabel("native"),
  "destination-artifact": "destination.so",
  "destination-artifact-sha256": hashLabel("destination"),
  "source-artifact": "source.so",
  "source-artifact-sha256": hashLabel("source"),
  "native-verifier-sbf-evidence": "native-evidence.json",
  "native-verifier-sbf-evidence-sha256": hashLabel("native-evidence"),
  "destination-sbf-evidence": "destination-evidence.json",
  "destination-sbf-evidence-sha256": hashLabel("destination-evidence"),
  "source-sbf-evidence": "source-evidence.json",
  "source-sbf-evidence-sha256": hashLabel("source-evidence"),
  "expected-validator-sha256": hashLabel("validator"),
  plan: "plan.json",
  "confirmation-template": "confirmation-template.json",
  confirmation: "confirmation.json",
  "confirmation-sha256-file": "confirmation.sha256",
  journal: "journal.jsonl",
  report: "report.json",
  "review-timeout-ms": "1000",
  submit: "true",
});

const optionsToArgv = (options) => [
  "ceremony",
  ...Object.entries(options).flatMap(([key, value]) => [`--${key}`, value]),
];

const builtPlanFor = ({
  operationId,
  payerAddress,
  deploymentAuthorityAddress,
  publicSignerIdsByRole,
  expectedArtifactSha256ByRole,
}) => {
  const programs = SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map((role, index) => {
    const programId = publicSignerIdsByRole[role].programId;
    return {
      role,
      programId,
      programdataAddress: PublicKey.findProgramAddressSync(
        [new PublicKey(programId).toBuffer()],
        LOADER,
      )[0].toBase58(),
      bufferAddress: publicSignerIdsByRole[role].bufferAddress,
      artifactSha256: expectedArtifactSha256ByRole[role],
      executableSha256: expectedArtifactSha256ByRole[role],
      codeHash: hashLabel(`code:${role}`),
      executableLength: 128 + index,
      maxDataLength: 128 + index,
      sbpfVersion: SOLANA_LOADER_V3_FRESH_SBF_ARCHITECTURE,
      sbfValidatorId: SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_ID,
      sbfValidatorVersion: SOLANA_LOADER_V3_FRESH_SBF_VALIDATOR_VERSION,
      sbfValidationPolicySha256:
        SOLANA_LOADER_V3_FRESH_SBF_VALIDATION_POLICY_SHA256,
      sbfValidationEvidenceSha256: hashLabel(`evidence:${role}`),
    };
  });
  const plan = {
    schema: SOLANA_LOADER_V3_FRESH_DEPLOY_PLAN_SCHEMA,
    operationId,
    network: SOLANA_TESTNET_NETWORK,
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    payerAddress,
    deploymentAuthorityAddress,
    context: {
      minFinalizedSlot: 100,
      expiresAtFinalizedSlot: 2_000,
      solanaCoreVersion: "2.1.0",
      featureSet: 123,
      sbpfV3EnableFeatureId: SOLANA_SBPF_V3_ENABLE_FEATURE_ID,
      sbpfV3EnableFeatureActivationSlot: 50,
      sbpfV3EnableFeatureAccountDataSha256: solanaSha256(featureData(50)),
    },
    policy: {
      maxPacketBytes: 1232,
      automaticMutationRetries: 0,
      runtimeOnlySigners: true,
      freshProgramsOnly: true,
      immutableAfterDeployment: true,
      exactProgramCount: 3,
      finalizationOrder: [...SOLANA_SCCP_IMMUTABLE_FINALIZATION_ROLE_ORDER],
    },
    programs,
  };
  const planBytes = canonicalSolanaLoaderV3FreshDeployPlanBytes(plan);
  const planSha256 = hashBytes(planBytes);
  const confirmationTemplate = {
    schema: SOLANA_LOADER_V3_FRESH_DEPLOY_CONFIRMATION_SCHEMA,
    action: "fresh-deploy-exact-immutable-solana-sccp-programs",
    submit: false,
    irreversible: true,
    operationId,
    planSha256,
    network: SOLANA_TESTNET_NETWORK,
    genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    programIds: Object.fromEntries(
      programs.map(({ role, programId }) => [role, programId]),
    ),
    acknowledgePermanentProgramIds: false,
    acknowledgeOneWayAuthorityRevocation: false,
  };
  return Object.freeze({
    plan,
    planBytes,
    planSha256,
    confirmationTemplate,
  });
};

const confirmTemplate = (template) => ({
  ...template,
  submit: true,
  acknowledgePermanentProgramIds: true,
  acknowledgeOneWayAuthorityRevocation: true,
});

const journalEventFor = ({
  plan,
  planSha256,
  sequence,
  type,
  journalId,
  details = {},
}) => ({
  schema: SOLANA_LOADER_V3_FRESH_DEPLOY_JOURNAL_EVENT_SCHEMA,
  sequence,
  type,
  network: SOLANA_TESTNET_NETWORK,
  genesisHash: SOLANA_TESTNET_GENESIS_HASH,
  operationId: plan.operationId,
  planSha256,
  journalId,
  payerAddress: plan.payerAddress,
  deploymentAuthorityAddress: plan.deploymentAuthorityAddress,
  programs: plan.programs.map(
    ({
      role,
      programId,
      programdataAddress,
      bufferAddress,
      artifactSha256,
    }) => ({
      role,
      programId,
      programdataAddress,
      bufferAddress,
      artifactSha256,
    }),
  ),
  details,
});

const eventHash = (event) =>
  hashBytes(Buffer.from(JSON.stringify(event), "utf8"));

const consumeAllSigners = async ({ plan, signerFactory }) => {
  const requests = [
    ["payer", plan.payerAddress],
    ["deploymentAuthority", plan.deploymentAuthorityAddress],
    ...plan.programs.flatMap(({ role, programId, bufferAddress }) => [
      [`program:${role}`, programId],
      [`buffer:${role}`, bufferAddress],
    ]),
  ];
  const sources = [];
  for (const [role, address] of requests) {
    sources.push(await signerFactory({ role, address }));
  }
  return sources;
};

const makeCeremonyFixture = async ({ connection = makeConnection() } = {}) => {
  const root = await makeRoot("operator-run");
  const contextPath = path.join(root, "context.json");
  const validatorPath = path.join(root, "validator.bin");
  const artifacts = {
    nativeVerifier: Buffer.from("native-verifier-artifact-v3"),
    destination: Buffer.from("destination-artifact-v3"),
    source: Buffer.from("source-artifact-v3"),
  };
  const evidence = {
    nativeVerifier: Buffer.from("native-verifier-evidence"),
    destination: Buffer.from("destination-evidence"),
    source: Buffer.from("source-evidence"),
  };
  const artifactPaths = {};
  const evidencePaths = {};
  const contextBytes =
    canonicalSolanaLoaderV3FreshDeployOperatorJsonBytes(contextValue());
  await writePrivate(contextPath, contextBytes);
  await writePrivate(validatorPath, Buffer.from("authenticated-validator"));
  for (const role of SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER) {
    artifactPaths[role] = path.join(root, `${role}.so`);
    evidencePaths[role] = path.join(root, `${role}-evidence.json`);
    await writePrivate(artifactPaths[role], artifacts[role]);
    await writePrivate(evidencePaths[role], evidence[role]);
  }
  const options = {
    "solana-rpc-url": DEFAULT_SOLANA_LOADER_V3_FRESH_DEPLOY_RPC_URL,
    context: contextPath,
    "expected-context-sha256": hashBytes(contextBytes),
    "native-verifier-artifact": artifactPaths.nativeVerifier,
    "native-verifier-artifact-sha256": hashBytes(artifacts.nativeVerifier),
    "destination-artifact": artifactPaths.destination,
    "destination-artifact-sha256": hashBytes(artifacts.destination),
    "source-artifact": artifactPaths.source,
    "source-artifact-sha256": hashBytes(artifacts.source),
    "native-verifier-sbf-evidence": evidencePaths.nativeVerifier,
    "native-verifier-sbf-evidence-sha256": hashBytes(evidence.nativeVerifier),
    "destination-sbf-evidence": evidencePaths.destination,
    "destination-sbf-evidence-sha256": hashBytes(evidence.destination),
    "source-sbf-evidence": evidencePaths.source,
    "source-sbf-evidence-sha256": hashBytes(evidence.source),
    "validator-bin": validatorPath,
    "expected-validator-sha256": hashBytes(
      Buffer.from("authenticated-validator"),
    ),
    plan: path.join(root, "plan.json"),
    "confirmation-template": path.join(root, "confirmation-template.json"),
    confirmation: path.join(root, "confirmation.json"),
    "confirmation-sha256-file": path.join(root, "confirmation.sha256"),
    journal: path.join(root, "journal.jsonl"),
    report: path.join(root, "report.json"),
    "review-timeout-ms": "1000",
    submit: "true",
  };
  const signers = Array.from({ length: 8 }, (_, index) =>
    Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => index + 1)),
  );
  const secretMarkers = signers.map((signer) =>
    Buffer.from(signer.secretKey).toString("base64"),
  );
  let signerIndex = 0;
  const notifications = [];
  const buildPlan = vi.fn((input) => builtPlanFor(input));
  const validateReport = vi.fn();
  const canonicalReport = vi.fn((report) =>
    canonicalSolanaLoaderV3FreshDeployOperatorJsonBytes(report),
  );
  const dependencies = {
    connectionFactory: vi.fn(() => connection),
    keypairFactory: vi.fn(() => signers[signerIndex++]),
    buildSolanaLoaderV3FreshDeployPlan: buildPlan,
    authenticatedValidatorFactory: vi.fn(() => vi.fn()),
    canonicalSolanaLoaderV3FreshDeployReportBytes: canonicalReport,
    validateSolanaLoaderV3FreshDeployReport: validateReport,
    notify: vi.fn((value) => notifications.push(value)),
    now: vi.fn(() => 10_000),
    installSignalHandlers: false,
  };
  const writeConfirmation = async ({
    transform = (value) => value,
    encode = canonicalSolanaLoaderV3FreshDeployOperatorConfirmationBytes,
    sidecarHash,
  } = {}) => {
    const template = JSON.parse(
      (await readFile(options["confirmation-template"])).toString("utf8"),
    );
    const reviewed = transform(confirmTemplate(template));
    const bytes = Buffer.from(encode(reviewed));
    await writePrivate(options.confirmation, bytes);
    await writePrivate(
      options["confirmation-sha256-file"],
      Buffer.from(`${sidecarHash ?? hashBytes(bytes)}\n`, "utf8"),
    );
  };
  dependencies.sleep = vi.fn(async () => writeConfirmation());
  return {
    root,
    options,
    artifacts,
    evidence,
    connection,
    signers,
    secretMarkers,
    notifications,
    dependencies,
    buildPlan,
    validateReport,
    canonicalReport,
    writeConfirmation,
  };
};

const positiveDeploy = () =>
  vi.fn(
    async ({ planBytes, expectedPlanSha256, signerFactory, dependencies }) => {
      const plan = JSON.parse(Buffer.from(planBytes).toString("utf8"));
      await consumeAllSigners({ plan, signerFactory });
      const claim = journalEventFor({
        plan,
        planSha256: expectedPlanSha256,
        sequence: 1,
        type: "claim",
        journalId: null,
        details: { stage: "claim" },
      });
      const claimed = await dependencies.operationJournal(
        claim,
        eventHash(claim),
      );
      const complete = journalEventFor({
        plan,
        planSha256: expectedPlanSha256,
        sequence: 2,
        type: "complete",
        journalId: claimed.journalId,
        details: { stage: "complete" },
      });
      await dependencies.operationJournal(complete, eventHash(complete));
      return { schema: "operator-test-report/v1", ready: true };
    },
  );

describe("Solana Loader-v3 fresh-deploy production operator", () => {
  describe("strict parser and CLI boundary", () => {
    it("accepts help only when it is the sole argument", () => {
      expect(parseSolanaLoaderV3FreshDeployOperatorArgs(["--help"])).toEqual({
        command: "help",
        options: {},
      });
      expect(parseSolanaLoaderV3FreshDeployOperatorArgs(["-h"])).toEqual({
        command: "help",
        options: {},
      });
      expect(() =>
        parseSolanaLoaderV3FreshDeployOperatorArgs(["--help", "ceremony"]),
      ).toThrow(/Expected snapshot-context/u);
    });

    it("parses the exact ceremony option surface", () => {
      const options = staticCeremonyOptions();
      expect(
        parseSolanaLoaderV3FreshDeployOperatorArgs(optionsToArgv(options)),
      ).toEqual({ command: "ceremony", options });
    });

    it.each([
      [["ceremony", "positional"], /Unexpected positional/u],
      [["ceremony", "--unknown", "x"], /Unknown option/u],
      [["ceremony", "--submit=true"], /Option=value/u],
      [
        [...optionsToArgv(staticCeremonyOptions()), "--report", "second.json"],
        /Duplicate option/u,
      ],
      [["snapshot-context", "--out"], /requires an explicit/u],
    ])("rejects hostile argument shape %#", (argv, error) => {
      expect(() => parseSolanaLoaderV3FreshDeployOperatorArgs(argv)).toThrow(
        error,
      );
    });

    it.each(["false", "TRUE", "1", "yes"])(
      "rejects irreversible submit value %s",
      (submit) => {
        const options = { ...staticCeremonyOptions(), submit };
        expect(() =>
          parseSolanaLoaderV3FreshDeployOperatorArgs(optionsToArgv(options)),
        ).toThrow(/exact --submit true/u);
      },
    );

    it("returns help without constructing network or signer dependencies", async () => {
      const connectionFactory = vi.fn(() => {
        throw new Error("network touched");
      });
      const keypairFactory = vi.fn(() => {
        throw new Error("signer touched");
      });
      const result = await runSolanaLoaderV3FreshDeployOperatorCli(["--help"], {
        connectionFactory,
        keypairFactory,
      });
      expect(result.help).toBe(true);
      expect(result.usage).toMatch(/^Usage:/u);
      expect(connectionFactory).not.toHaveBeenCalled();
      expect(keypairFactory).not.toHaveBeenCalled();
    });
  });

  describe("canonical public artifacts and context", () => {
    it("sorts canonical JSON recursively and writes one trailing newline", () => {
      const bytes = canonicalSolanaLoaderV3FreshDeployOperatorJsonBytes({
        z: 2,
        a: { d: 4, b: 3 },
      });
      expect(bytes.toString("utf8")).toBe('{"a":{"b":3,"d":4},"z":2}\n');
      expect(() =>
        canonicalSolanaLoaderV3FreshDeployOperatorJsonBytes({ value: 1.5 }),
      ).toThrow(/non-canonical number/u);
    });

    it("snapshots exact canonical testnet context once without overwrite", async () => {
      const root = await makeRoot("context");
      const out = path.join(root, "context.json");
      const connection = makeConnection();
      const result = await snapshotSolanaLoaderV3FreshDeployContext(
        {
          "solana-rpc-url": DEFAULT_SOLANA_LOADER_V3_FRESH_DEPLOY_RPC_URL,
          "valid-for-slots": "1500",
          out,
        },
        {
          connectionFactory: vi.fn(() => connection),
          now: () => new Date("2026-07-19T00:00:00.000Z"),
        },
      );
      const bytes = await readFile(out);
      expect(result.sha256).toBe(hashBytes(bytes));
      expect(bytes.at(-1)).toBe(0x0a);
      expect(result.context.reviewedContext).toMatchObject({
        finalizedSlot: 100,
        expiresAtFinalizedSlot: 1600,
        solanaCoreVersion: "2.1.0",
        featureSet: 123,
      });
      await expect(
        snapshotSolanaLoaderV3FreshDeployContext(
          {
            "solana-rpc-url": DEFAULT_SOLANA_LOADER_V3_FRESH_DEPLOY_RPC_URL,
            "valid-for-slots": "1500",
            out,
          },
          { connectionFactory: () => connection },
        ),
      ).rejects.toThrow(/already exists/u);
    });

    it("rejects wrong genesis before writing a context snapshot", async () => {
      const root = await makeRoot("wrong-genesis");
      const out = path.join(root, "context.json");
      await expect(
        snapshotSolanaLoaderV3FreshDeployContext(
          {
            "solana-rpc-url": DEFAULT_SOLANA_LOADER_V3_FRESH_DEPLOY_RPC_URL,
            "valid-for-slots": "1500",
            out,
          },
          {
            connectionFactory: () =>
              makeConnection({ genesisHash: hashLabel("other-genesis") }),
          },
        ),
      ).rejects.toThrow(/not canonical Solana testnet/u);
      await expect(lstat(out)).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  describe("filesystem confinement", () => {
    it("accepts only pairwise-distinct private input and absent output paths", async () => {
      const root = await makeRoot("paths");
      const first = path.join(root, "first.bin");
      const second = path.join(root, "second.bin");
      const output = path.join(root, "out.json");
      await writePrivate(first, Buffer.from("first"));
      await writePrivate(second, Buffer.from("second"));
      const checked = await assertSolanaLoaderV3FreshDeployOperatorPaths({
        inputs: [
          { path: first, label: "first" },
          { path: second, label: "second" },
        ],
        outputs: [{ path: output, label: "output" }],
      });
      expect(checked.inputs.map((entry) => entry.path)).toEqual([
        first,
        second,
      ]);
      expect(checked.outputs[0].path).toBe(output);
    });

    it("rejects duplicate paths and existing outputs", async () => {
      const root = await makeRoot("path-duplicates");
      const input = path.join(root, "input.bin");
      const output = path.join(root, "output.json");
      await writePrivate(input, Buffer.from("input"));
      await writePrivate(output, Buffer.from("occupied"));
      await expect(
        assertSolanaLoaderV3FreshDeployOperatorPaths({
          inputs: [{ path: input, label: "input" }],
          outputs: [{ path: input, label: "output" }],
        }),
      ).rejects.toThrow(/pairwise distinct/u);
      await expect(
        assertSolanaLoaderV3FreshDeployOperatorPaths({
          inputs: [{ path: input, label: "input" }],
          outputs: [{ path: output, label: "output" }],
        }),
      ).rejects.toThrow(/already exists/u);
    });

    it("rejects hardlinked, symlinked, writable-by-others, and secret-named inputs", async () => {
      const root = await makeRoot("path-hostile");
      const original = path.join(root, "original.bin");
      const hard = path.join(root, "hard.bin");
      const symbolic = path.join(root, "symbolic.bin");
      const writable = path.join(root, "writable.bin");
      const secretNamed = path.join(root, "wallet-key.bin");
      await writePrivate(original, Buffer.from("original"));
      await link(original, hard);
      await symlink(original, symbolic);
      await writePrivate(writable, Buffer.from("writable"));
      await chmod(writable, 0o622);
      await writePrivate(secretNamed, Buffer.from("public-but-bad-name"));
      for (const target of [original, hard, symbolic, writable]) {
        await expect(
          assertSolanaLoaderV3FreshDeployOperatorPaths({
            inputs: [{ path: target, label: "input" }],
            outputs: [
              {
                path: path.join(root, `${path.basename(target)}.out`),
                label: "out",
              },
            ],
          }),
        ).rejects.toThrow(/owned, single-link|regular file/u);
      }
      await expect(
        assertSolanaLoaderV3FreshDeployOperatorPaths({
          inputs: [{ path: secretNamed, label: "input" }],
          outputs: [{ path: path.join(root, "out.json"), label: "out" }],
        }),
      ).rejects.toThrow(/non-secret public path/u);
    });

    it("rejects a missing output routed through a symlinked directory", async () => {
      const root = await makeRoot("path-parent-link");
      const realDirectory = path.join(root, "real");
      const linkedDirectory = path.join(root, "linked");
      const input = path.join(root, "input.bin");
      await mkdir(realDirectory, { mode: 0o700 });
      await symlink(realDirectory, linkedDirectory);
      await writePrivate(input, Buffer.from("input"));
      await expect(
        assertSolanaLoaderV3FreshDeployOperatorPaths({
          inputs: [{ path: input, label: "input" }],
          outputs: [
            { path: path.join(linkedDirectory, "out.json"), label: "output" },
          ],
        }),
      ).rejects.toThrow(/symlink|directory/u);
    });
  });

  describe("durable public journal", () => {
    const makeJournalFixture = async () => {
      const root = await makeRoot("journal");
      const journalPath = path.join(root, "journal.jsonl");
      const signers = Array.from({ length: 8 }, (_, index) =>
        Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => index + 31)),
      );
      const built = builtPlanFor({
        operationId: hashLabel("journal-operation"),
        payerAddress: signers[0].publicKey.toBase58(),
        deploymentAuthorityAddress: signers[1].publicKey.toBase58(),
        publicSignerIdsByRole: Object.fromEntries(
          SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map((role, index) => [
            role,
            {
              programId: signers[index * 2 + 2].publicKey.toBase58(),
              bufferAddress: signers[index * 2 + 3].publicKey.toBase58(),
            },
          ]),
        ),
        expectedArtifactSha256ByRole: Object.fromEntries(
          SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER.map((role) => [
            role,
            hashLabel(`artifact:${role}`),
          ]),
        ),
      });
      const directoryPin = await pinSolanaExactOutputDirectory(journalPath);
      const directorySync = vi.spyOn(directoryPin.handle, "sync");
      const adapter =
        await createDurableSolanaLoaderV3FreshDeployJournalAdapter({
          journalPath,
          operationId: built.plan.operationId,
          planSha256: built.planSha256,
          directoryPin,
        });
      return {
        root,
        journalPath,
        built,
        directoryPin,
        directorySync,
        adapter,
      };
    };

    it("persists insertion-order event bytes plus an unhashed JSONL newline before acknowledgement", async () => {
      const fixture = await makeJournalFixture();
      const claim = journalEventFor({
        plan: fixture.built.plan,
        planSha256: fixture.built.planSha256,
        sequence: 1,
        type: "claim",
        journalId: null,
      });
      const response = await fixture.adapter.operationJournal(
        claim,
        eventHash(claim),
      );
      expect(response).toEqual({
        durable: true,
        accepted: true,
        eventSha256: eventHash(claim),
        journalId: `fresh-${fixture.built.plan.operationId.slice(2, 34)}`,
      });
      expect(await readFile(fixture.journalPath, "utf8")).toBe(
        `${JSON.stringify(claim)}\n`,
      );
      expect(fixture.directorySync).toHaveBeenCalledTimes(1);
      expect(fixture.adapter.claimed).toBe(true);
      await fixture.adapter.close();
      await fixture.directoryPin.handle.close();
    });

    it("rejects malformed identity, event hash, and forbidden public fields before creating a claim", async () => {
      const fixture = await makeJournalFixture();
      const base = journalEventFor({
        plan: fixture.built.plan,
        planSha256: fixture.built.planSha256,
        sequence: 1,
        type: "claim",
        journalId: null,
      });
      const malformed = { ...base, operationId: hashLabel("wrong-operation") };
      await expect(
        fixture.adapter.operationJournal(malformed, eventHash(malformed)),
      ).rejects.toThrow(/malformed/u);
      await expect(
        fixture.adapter.operationJournal(base, hashLabel("wrong-event")),
      ).rejects.toThrow(/hash is not exact/u);
      const forbidden = {
        ...base,
        details: { private_key: "forbidden" },
      };
      await expect(
        fixture.adapter.operationJournal(forbidden, eventHash(forbidden)),
      ).rejects.toThrow(/forbidden field/u);
      await expect(lstat(fixture.journalPath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      await fixture.adapter.close();
      await fixture.directoryPin.handle.close();
    });

    it("rejects pre-claim, duplicate-claim, noncontiguous, and changed-identity events", async () => {
      const fixture = await makeJournalFixture();
      const claim = journalEventFor({
        plan: fixture.built.plan,
        planSha256: fixture.built.planSha256,
        sequence: 1,
        type: "claim",
        journalId: null,
      });
      const premature = { ...claim, type: "intent", journalId: "fresh-x" };
      await expect(
        fixture.adapter.operationJournal(premature, eventHash(premature)),
      ).rejects.toThrow(/precedes its durable claim/u);
      const accepted = await fixture.adapter.operationJournal(
        claim,
        eventHash(claim),
      );
      const duplicate = { ...claim, sequence: 2 };
      await expect(
        fixture.adapter.operationJournal(duplicate, eventHash(duplicate)),
      ).rejects.toThrow(/duplicated/u);
      const gap = {
        ...claim,
        sequence: 3,
        type: "intent",
        journalId: accepted.journalId,
      };
      await expect(
        fixture.adapter.operationJournal(gap, eventHash(gap)),
      ).rejects.toThrow(/not contiguous/u);
      const changed = {
        ...claim,
        sequence: 2,
        type: "intent",
        journalId: accepted.journalId,
        payerAddress: Keypair.generate().publicKey.toBase58(),
      };
      await expect(
        fixture.adapter.operationJournal(changed, eventHash(changed)),
      ).rejects.toThrow(/identity changed/u);
      await fixture.adapter.close();
      await fixture.directoryPin.handle.close();
    });

    it("detects journal path replacement after the durable claim", async () => {
      const fixture = await makeJournalFixture();
      const claim = journalEventFor({
        plan: fixture.built.plan,
        planSha256: fixture.built.planSha256,
        sequence: 1,
        type: "claim",
        journalId: null,
      });
      const accepted = await fixture.adapter.operationJournal(
        claim,
        eventHash(claim),
      );
      await rename(fixture.journalPath, `${fixture.journalPath}.moved`);
      await writePrivate(fixture.journalPath, Buffer.from("replacement"));
      const intent = {
        ...claim,
        sequence: 2,
        type: "intent",
        journalId: accepted.journalId,
      };
      await expect(
        fixture.adapter.operationJournal(intent, eventHash(intent)),
      ).rejects.toThrow(/identity changed during append/u);
      await fixture.adapter.close();
      await fixture.directoryPin.handle.close();
    });
  });

  describe("single-process confirmation and signer ceremony", () => {
    it("generates, issues, and wipes exactly eight distinct runtime-only signer sources", async () => {
      const fixture = await makeCeremonyFixture();
      const deploy = positiveDeploy();
      fixture.dependencies.deployFreshImmutableSolanaSccpPrograms = deploy;
      const result = await runSolanaLoaderV3FreshDeployOperator(
        fixture.options,
        fixture.dependencies,
      );
      expect(result.report).toEqual({
        schema: "operator-test-report/v1",
        ready: true,
      });
      expect(fixture.dependencies.keypairFactory).toHaveBeenCalledTimes(8);
      expect(deploy).toHaveBeenCalledTimes(1);
      const call = deploy.mock.calls[0][0];
      expect(call.confirmation).toMatchObject({
        submit: true,
        acknowledgePermanentProgramIds: true,
        acknowledgeOneWayAuthorityRevocation: true,
      });
      expect(Object.keys(call.confirmation.programIds)).toEqual([
        ...SOLANA_SCCP_FRESH_DEPLOY_ROLE_ORDER,
      ]);
      expect(fixture.signers).toHaveLength(8);
      expect(
        new Set(fixture.signers.map((signer) => signer.publicKey.toBase58())),
      ).toHaveLength(8);
      expect(
        fixture.signers.every((signer) =>
          signer.secretKey.every((byte) => byte === 0),
        ),
      ).toBe(true);
      expect(fixture.validateReport).toHaveBeenCalledTimes(1);
      expect(await readFile(fixture.options.report)).toEqual(
        canonicalSolanaLoaderV3FreshDeployOperatorJsonBytes(result.report),
      );
      await expect(
        lstat(`${fixture.options.journal}.lock`),
      ).rejects.toMatchObject({ code: "ENOENT" });
    });

    it("validates pins and live context before generating any signer", async () => {
      const fixture = await makeCeremonyFixture();
      fixture.options["expected-validator-sha256"] = `0x${"00".repeat(32)}`;
      await expect(
        runSolanaLoaderV3FreshDeployOperator(
          fixture.options,
          fixture.dependencies,
        ),
      ).rejects.toThrow(/non-placeholder lowercase/u);
      expect(fixture.dependencies.keypairFactory).not.toHaveBeenCalled();

      const drift = await makeCeremonyFixture({
        connection: makeConnection({ coreVersion: "2.2.0" }),
      });
      await expect(
        runSolanaLoaderV3FreshDeployOperator(drift.options, drift.dependencies),
      ).rejects.toThrow(/differs from the reviewed/u);
      expect(drift.dependencies.keypairFactory).not.toHaveBeenCalled();
    });

    it("rejects noncanonical confirmation bytes and wipes signers without invoking core", async () => {
      const fixture = await makeCeremonyFixture();
      const deploy = vi.fn();
      fixture.dependencies.deployFreshImmutableSolanaSccpPrograms = deploy;
      fixture.dependencies.sleep = vi.fn(async () =>
        fixture.writeConfirmation({
          encode: (value) => Buffer.from(JSON.stringify(value), "utf8"),
        }),
      );
      await expect(
        runSolanaLoaderV3FreshDeployOperator(
          fixture.options,
          fixture.dependencies,
        ),
      ).rejects.toThrow(/canonical JSON with one trailing newline/u);
      expect(deploy).not.toHaveBeenCalled();
      expect(
        fixture.signers.every((signer) =>
          signer.secretKey.every((byte) => byte === 0),
        ),
      ).toBe(true);
    });

    it("rejects a mismatched independent confirmation hash", async () => {
      const fixture = await makeCeremonyFixture();
      const deploy = vi.fn();
      fixture.dependencies.deployFreshImmutableSolanaSccpPrograms = deploy;
      fixture.dependencies.sleep = vi.fn(async () =>
        fixture.writeConfirmation({ sidecarHash: hashLabel("wrong-review") }),
      );
      await expect(
        runSolanaLoaderV3FreshDeployOperator(
          fixture.options,
          fixture.dependencies,
        ),
      ).rejects.toThrow(/differ from the independent SHA-256 pin/u);
      expect(deploy).not.toHaveBeenCalled();
    });

    it.each([
      ["stale plan", (value) => ({ ...value, planSha256: hashLabel("stale") })],
      [
        "missing permanent-id acknowledgement",
        (value) => ({ ...value, acknowledgePermanentProgramIds: false }),
      ],
      [
        "missing revocation acknowledgement",
        (value) => ({ ...value, acknowledgeOneWayAuthorityRevocation: false }),
      ],
    ])(
      "rejects %s in an otherwise canonical confirmation",
      async (_label, transform) => {
        const fixture = await makeCeremonyFixture();
        const deploy = vi.fn();
        fixture.dependencies.deployFreshImmutableSolanaSccpPrograms = deploy;
        fixture.dependencies.sleep = vi.fn(async () =>
          fixture.writeConfirmation({ transform }),
        );
        await expect(
          runSolanaLoaderV3FreshDeployOperator(
            fixture.options,
            fixture.dependencies,
          ),
        ).rejects.toThrow(/exact irreversible reviewed decision/u);
        expect(deploy).not.toHaveBeenCalled();
      },
    );

    it.each(["symlink", "hardlink"])(
      "rejects a %s confirmation snapshot",
      async (kind) => {
        const fixture = await makeCeremonyFixture();
        const deploy = vi.fn();
        fixture.dependencies.deployFreshImmutableSolanaSccpPrograms = deploy;
        fixture.dependencies.sleep = vi.fn(async () => {
          const template = JSON.parse(
            (await readFile(fixture.options["confirmation-template"])).toString(
              "utf8",
            ),
          );
          const bytes =
            canonicalSolanaLoaderV3FreshDeployOperatorConfirmationBytes(
              confirmTemplate(template),
            );
          const source = path.join(fixture.root, "review-source.json");
          await writePrivate(source, bytes);
          if (kind === "symlink") {
            await symlink(source, fixture.options.confirmation);
          } else {
            await link(source, fixture.options.confirmation);
          }
          await writePrivate(
            fixture.options["confirmation-sha256-file"],
            Buffer.from(`${hashBytes(bytes)}\n`),
          );
        });
        await expect(
          runSolanaLoaderV3FreshDeployOperator(
            fixture.options,
            fixture.dependencies,
          ),
        ).rejects.toThrow(/single-link|regular file/u);
        expect(deploy).not.toHaveBeenCalled();
      },
    );

    it("bounds confirmation wait, invokes no core, and wipes all signers on timeout", async () => {
      const fixture = await makeCeremonyFixture();
      const deploy = vi.fn();
      let milliseconds = 0;
      fixture.dependencies.deployFreshImmutableSolanaSccpPrograms = deploy;
      fixture.dependencies.now = vi.fn(() => milliseconds);
      fixture.dependencies.sleep = vi.fn(async (duration) => {
        milliseconds += duration + 500;
      });
      await expect(
        runSolanaLoaderV3FreshDeployOperator(
          fixture.options,
          fixture.dependencies,
        ),
      ).rejects.toThrow(/review window expired/u);
      expect(deploy).not.toHaveBeenCalled();
      expect(
        fixture.signers.every((signer) =>
          signer.secretKey.every((byte) => byte === 0),
        ),
      ).toBe(true);
    });

    it.each(["SIGINT", "SIGTERM"])(
      "%s interrupts review before mutation and removes its handler",
      async (signal) => {
        const fixture = await makeCeremonyFixture();
        const deploy = vi.fn();
        const priorListeners = process.listenerCount(signal);
        fixture.dependencies.installSignalHandlers = true;
        fixture.dependencies.deployFreshImmutableSolanaSccpPrograms = deploy;
        fixture.dependencies.sleep = vi.fn(async () => {
          process.emit(signal);
        });
        await expect(
          runSolanaLoaderV3FreshDeployOperator(
            fixture.options,
            fixture.dependencies,
          ),
        ).rejects.toThrow(/interrupted before mutation/u);
        expect(deploy).not.toHaveBeenCalled();
        expect(process.listenerCount(signal)).toBe(priorListeners);
        expect(
          fixture.signers.every((signer) =>
            signer.secretKey.every((byte) => byte === 0),
          ),
        ).toBe(true);
      },
    );

    it("never emits or persists any runtime signer bytes", async () => {
      const fixture = await makeCeremonyFixture();
      fixture.dependencies.deployFreshImmutableSolanaSccpPrograms =
        positiveDeploy();
      await runSolanaLoaderV3FreshDeployOperator(
        fixture.options,
        fixture.dependencies,
      );
      const publicBytes = Buffer.concat([
        await collectFiles(fixture.root),
        Buffer.from(JSON.stringify(fixture.notifications), "utf8"),
      ]).toString("utf8");
      for (const marker of fixture.secretMarkers) {
        expect(publicBytes).not.toContain(marker);
      }
      expect(JSON.stringify(fixture.notifications)).not.toMatch(
        /secret|private.?key|raw.?transaction|signed.?transaction/iu,
      );
    });
  });

  describe("exactly-once mutation and recovery", () => {
    it("retains the lease and requires manual recovery after a claimed core failure", async () => {
      const fixture = await makeCeremonyFixture();
      const deploy = vi.fn(
        async ({
          planBytes,
          expectedPlanSha256,
          signerFactory,
          dependencies,
        }) => {
          const plan = JSON.parse(Buffer.from(planBytes).toString("utf8"));
          await consumeAllSigners({ plan, signerFactory });
          const claim = journalEventFor({
            plan,
            planSha256: expectedPlanSha256,
            sequence: 1,
            type: "claim",
            journalId: null,
          });
          await dependencies.operationJournal(claim, eventHash(claim));
          throw new Error("indeterminate broadcast");
        },
      );
      fixture.dependencies.deployFreshImmutableSolanaSccpPrograms = deploy;
      await expect(
        runSolanaLoaderV3FreshDeployOperator(
          fixture.options,
          fixture.dependencies,
        ),
      ).rejects.toMatchObject({
        name: "SolanaLoaderV3FreshDeployOperatorRecoveryError",
        message: expect.stringMatching(/Manual recovery.*Automatic retry/u),
      });
      expect(deploy).toHaveBeenCalledTimes(1);
      expect((await lstat(`${fixture.options.journal}.lock`)).isFile()).toBe(
        true,
      );
      const plan = JSON.parse(await readFile(fixture.options.plan, "utf8"));
      const leaseRecords = (
        await readFile(`${fixture.options.journal}.lock`, "utf8")
      )
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(leaseRecords).toHaveLength(2);
      expect(leaseRecords[0]).toMatchObject({
        type: "context-claim",
        contextSha256: fixture.options["expected-context-sha256"],
      });
      expect(leaseRecords[1]).toMatchObject({
        type: "plan-bound",
        operationId: plan.operationId,
        planSha256: hashBytes(await readFile(fixture.options.plan)),
      });
      expect(await readFile(fixture.options.journal, "utf8")).toMatch(
        /"type":"claim"/u,
      );
      expect(
        fixture.signers.every((signer) =>
          signer.secretKey.every((byte) => byte === 0),
        ),
      ).toBe(true);
    });

    it("does not persist a report and never retries when post-complete validation fails", async () => {
      const fixture = await makeCeremonyFixture();
      const deploy = positiveDeploy();
      fixture.dependencies.deployFreshImmutableSolanaSccpPrograms = deploy;
      fixture.dependencies.validateSolanaLoaderV3FreshDeployReport = vi.fn(
        () => {
          throw new Error("report validation rejected");
        },
      );
      await expect(
        runSolanaLoaderV3FreshDeployOperator(
          fixture.options,
          fixture.dependencies,
        ),
      ).rejects.toMatchObject({
        name: "SolanaLoaderV3FreshDeployOperatorRecoveryError",
      });
      expect(deploy).toHaveBeenCalledTimes(1);
      await expect(lstat(fixture.options.report)).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect((await lstat(`${fixture.options.journal}.lock`)).isFile()).toBe(
        true,
      );
    });

    it("fails closed when the core consumes fewer than all eight signer roles", async () => {
      const fixture = await makeCeremonyFixture();
      const deploy = vi.fn(async ({ planBytes, signerFactory }) => {
        const plan = JSON.parse(Buffer.from(planBytes).toString("utf8"));
        await signerFactory({ role: "payer", address: plan.payerAddress });
        return { schema: "incomplete-core-report/v1" };
      });
      fixture.dependencies.deployFreshImmutableSolanaSccpPrograms = deploy;
      await expect(
        runSolanaLoaderV3FreshDeployOperator(
          fixture.options,
          fixture.dependencies,
        ),
      ).rejects.toThrow(/did not consume exactly eight/u);
      expect(deploy).toHaveBeenCalledTimes(1);
      expect(
        fixture.signers.every((signer) =>
          signer.secretKey.every((byte) => byte === 0),
        ),
      ).toBe(true);
    });

    it("refuses a pre-existing report before constructing signers or invoking core", async () => {
      const fixture = await makeCeremonyFixture();
      const deploy = vi.fn();
      fixture.dependencies.deployFreshImmutableSolanaSccpPrograms = deploy;
      await writePrivate(fixture.options.report, Buffer.from("occupied"));
      await expect(
        runSolanaLoaderV3FreshDeployOperator(
          fixture.options,
          fixture.dependencies,
        ),
      ).rejects.toThrow(/already exists/u);
      expect(fixture.dependencies.keypairFactory).not.toHaveBeenCalled();
      expect(deploy).not.toHaveBeenCalled();
    });
  });

  it("the real CLI rejects hostile help combinations without filesystem mutation", async () => {
    const root = await makeRoot("spawn-cli");
    const { spawn } = await import("node:child_process");
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ["--import", irohaSdkNodeRegister, operatorScript, "--help", "x"],
        {
          cwd: root,
          env: {
            ...process.env,
            HOME: root,
            TMPDIR: root,
            IROHA_JS_NODE_SELECTED_SDK_ROOT: selectedIrohaSdkRoot,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.once("error", reject);
      child.once("close", (status) => resolve({ status, stdout, stderr }));
    });
    expect(result).toMatchObject({ status: 1, stdout: "" });
    expect(result.stderr).toMatch(/Expected snapshot-context/u);
    expect(await readdir(root)).toEqual([]);
  });
});
