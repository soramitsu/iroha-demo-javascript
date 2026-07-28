import { createHash } from "node:crypto";
import { lstatSync } from "node:fs";
import { join } from "node:path";
import {
  fetchGovernanceValidationFeePolicy,
  type GovernanceValidationFeeCoreFetch,
  type GovernanceValidationFeeEnabledConfig,
  type GovernanceValidationFeeFinalityObservation,
  type GovernanceValidationFeePolicyView,
} from "./governanceValidationFee";
import {
  governanceIntegrityDirectoryPath,
  loadSecureBoundedJson,
  secureWriteBoundedFile,
} from "./secureBoundedJson";

export const GOVERNANCE_VALIDATION_FEE_POLICY_IPC_CHANNEL =
  "governance:getCurrentValidationFeePolicy";
export const GOVERNANCE_VALIDATION_FEE_FINALITY_FILENAME =
  "governance-validation-fee-finality.json";
export const GOVERNANCE_VALIDATION_FEE_FINALITY_MARKER_FILENAME =
  "governance-validation-fee-finality.initialized.json";
export const GOVERNANCE_VALIDATION_FEE_FINALITY_SCHEMA =
  "sora.wallet.governance-validation-fee-finality.v1";
export const GOVERNANCE_VALIDATION_FEE_FINALITY_MARKER_SCHEMA =
  "sora.wallet.governance-validation-fee-finality-initialized.v1";

const FINALITY_STATE_LABEL = "Governance validation-fee finality state";
const FINALITY_MARKER_LABEL =
  "Governance validation-fee finality initialization marker";
const MAX_FINALITY_STATE_BYTES = 256 * 1024;
const MAX_FINALITY_MARKER_BYTES = 4 * 1024;
const MAX_TRUST_SCOPES = 64;
const LOWER_HASH = /^[0-9a-f]{64}$/u;
const TRUST_SCOPE_DOMAIN =
  "sora.wallet.governance-validation-fee-ledger-scope.v1\0";

declare const immutableLedgerScopeBrand: unique symbol;
export type GovernanceValidationFeeImmutableLedgerScope = string & {
  readonly [immutableLedgerScopeBrand]: true;
};

type StoredObservation = Readonly<{
  ledgerFinalisedHeight: number;
  contextId: string;
  blockHash: string;
  policyVersion: number;
  policyHash: string;
  projectionHash: string;
}>;

type FinalityState = Readonly<{
  schema: typeof GOVERNANCE_VALIDATION_FEE_FINALITY_SCHEMA;
  observations: Readonly<Record<string, StoredObservation>>;
}>;

type FinalityMarker = Readonly<{
  schema: typeof GOVERNANCE_VALIDATION_FEE_FINALITY_MARKER_SCHEMA;
  state_schema: typeof GOVERNANCE_VALIDATION_FEE_FINALITY_SCHEMA;
}>;

type JsonRecord = Record<string, unknown>;

export type GovernanceValidationFeeRuntimeCoordinates = Readonly<{
  validationFee: GovernanceValidationFeeEnabledConfig;
  cbsiCoreApiBaseUrl: string;
}>;

export type GovernanceValidationFeeTrustedSenderCheck = Readonly<{
  ownerMatchesMainWindow: boolean;
  ownerDestroyed: boolean;
  senderFrame: ({ readonly url?: unknown } & object) | null;
  mainFrame: object | null;
  trustedRendererUrl: string;
  requestPayload: unknown;
}>;

const exactRecord = (
  value: unknown,
  keys: readonly string[],
  label: string,
): JsonRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  const record = value as JsonRecord;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} fields must be exactly ${expected.join(", ")}.`);
  }
  return record;
};

const exactHash = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    !LOWER_HASH.test(value) ||
    /^0+$/u.test(value)
  ) {
    throw new Error(`${label} must be a non-zero lowercase 64-hex hash.`);
  }
  return value;
};

const positiveSafeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return Number(value);
};

const parseObservation = (
  value: unknown,
  label: string,
): GovernanceValidationFeeFinalityObservation => {
  const record = exactRecord(
    value,
    [
      "blockHash",
      "contextId",
      "ledgerFinalisedHeight",
      "policyHash",
      "policyVersion",
      "projectionHash",
    ],
    label,
  );
  return Object.freeze({
    ledgerFinalisedHeight: positiveSafeInteger(
      record.ledgerFinalisedHeight,
      `${label}.ledgerFinalisedHeight`,
    ),
    contextId: exactHash(record.contextId, `${label}.contextId`),
    blockHash: exactHash(record.blockHash, `${label}.blockHash`),
    policyVersion: positiveSafeInteger(
      record.policyVersion,
      `${label}.policyVersion`,
    ),
    policyHash: exactHash(record.policyHash, `${label}.policyHash`),
    projectionHash: exactHash(record.projectionHash, `${label}.projectionHash`),
  });
};

const parseStoredObservation = (
  value: unknown,
  label: string,
): StoredObservation => parseObservation(value, label);

const canonicalState = (state: FinalityState): string => {
  const observations = Object.fromEntries(
    Object.entries(state.observations)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([scope, observation]) => [
        scope,
        {
          ledgerFinalisedHeight: observation.ledgerFinalisedHeight,
          contextId: observation.contextId,
          blockHash: observation.blockHash,
          policyVersion: observation.policyVersion,
          policyHash: observation.policyHash,
          projectionHash: observation.projectionHash,
        },
      ]),
  );
  return JSON.stringify({
    schema: GOVERNANCE_VALIDATION_FEE_FINALITY_SCHEMA,
    observations,
  });
};

const canonicalMarker = (): string =>
  JSON.stringify({
    schema: GOVERNANCE_VALIDATION_FEE_FINALITY_MARKER_SCHEMA,
    state_schema: GOVERNANCE_VALIDATION_FEE_FINALITY_SCHEMA,
  });

const parseState = (value: unknown): FinalityState => {
  const state = exactRecord(
    value,
    ["observations", "schema"],
    FINALITY_STATE_LABEL,
  );
  if (state.schema !== GOVERNANCE_VALIDATION_FEE_FINALITY_SCHEMA) {
    throw new Error(
      `${FINALITY_STATE_LABEL}.schema must be ${GOVERNANCE_VALIDATION_FEE_FINALITY_SCHEMA}.`,
    );
  }
  if (
    !state.observations ||
    typeof state.observations !== "object" ||
    Array.isArray(state.observations)
  ) {
    throw new Error(`${FINALITY_STATE_LABEL}.observations must be an object.`);
  }
  const entries = Object.entries(state.observations as JsonRecord);
  if (entries.length > MAX_TRUST_SCOPES) {
    throw new Error(
      `${FINALITY_STATE_LABEL} exceeds ${MAX_TRUST_SCOPES} immutable ledger scopes.`,
    );
  }
  const observations: Record<string, StoredObservation> = {};
  for (const [scope, observation] of entries) {
    const canonicalScope = exactHash(
      scope,
      `${FINALITY_STATE_LABEL} immutable ledger scope`,
    );
    observations[canonicalScope] = parseStoredObservation(
      observation,
      `${FINALITY_STATE_LABEL}.observations.${canonicalScope}`,
    );
  }
  return Object.freeze({
    schema: GOVERNANCE_VALIDATION_FEE_FINALITY_SCHEMA,
    observations: Object.freeze(observations),
  });
};

const parseMarker = (value: unknown): FinalityMarker => {
  const marker = exactRecord(
    value,
    ["schema", "state_schema"],
    FINALITY_MARKER_LABEL,
  );
  if (
    marker.schema !== GOVERNANCE_VALIDATION_FEE_FINALITY_MARKER_SCHEMA ||
    marker.state_schema !== GOVERNANCE_VALIDATION_FEE_FINALITY_SCHEMA
  ) {
    throw new Error(`${FINALITY_MARKER_LABEL} has the wrong schema binding.`);
  }
  return Object.freeze({
    schema: GOVERNANCE_VALIDATION_FEE_FINALITY_MARKER_SCHEMA,
    state_schema: GOVERNANCE_VALIDATION_FEE_FINALITY_SCHEMA,
  });
};

const emptyState = (): FinalityState =>
  Object.freeze({
    schema: GOVERNANCE_VALIDATION_FEE_FINALITY_SCHEMA,
    observations: Object.freeze({}),
  });

const isNotFoundError = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT",
  );

const pathExists = (path: string, label: string): boolean => {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw new Error(`${label} is unavailable: ${String(error)}`);
  }
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

const sameTrustedRendererOrigin = (
  actualUrl: unknown,
  trustedUrl: string,
): boolean => {
  if (typeof actualUrl !== "string" || !actualUrl.trim()) return false;
  try {
    const actual = new URL(actualUrl);
    const trusted = new URL(trustedUrl);
    return (
      !actual.username &&
      !actual.password &&
      !trusted.username &&
      !trusted.password &&
      actual.protocol === trusted.protocol &&
      actual.hostname === trusted.hostname &&
      actual.port === trusted.port
    );
  } catch {
    return false;
  }
};

const rejectRegressionOrEquivocation = (
  previous: StoredObservation,
  current: StoredObservation,
): void => {
  if (
    current.ledgerFinalisedHeight < previous.ledgerFinalisedHeight ||
    current.policyVersion < previous.policyVersion
  ) {
    throw new Error(
      "CBSI Core validation-fee finality regressed behind a previously verified durable state.",
    );
  }
  if (
    (current.ledgerFinalisedHeight === previous.ledgerFinalisedHeight &&
      (current.contextId !== previous.contextId ||
        current.blockHash !== previous.blockHash ||
        current.projectionHash !== previous.projectionHash)) ||
    (current.policyVersion === previous.policyVersion &&
      current.policyHash !== previous.policyHash)
  ) {
    throw new Error(
      "CBSI Core validation-fee projection equivocated at an already verified durable height or policy version.",
    );
  }
};

const observationsEqual = (
  left: StoredObservation,
  right: StoredObservation,
): boolean =>
  left.ledgerFinalisedHeight === right.ledgerFinalisedHeight &&
  left.contextId === right.contextId &&
  left.blockHash === right.blockHash &&
  left.policyVersion === right.policyVersion &&
  left.policyHash === right.policyHash &&
  left.projectionHash === right.projectionHash;

export const governanceValidationFeeFinalityPath = (
  userDataPath: string,
): string =>
  join(
    governanceIntegrityDirectoryPath(userDataPath),
    GOVERNANCE_VALIDATION_FEE_FINALITY_FILENAME,
  );

export const governanceValidationFeeFinalityMarkerPath = (
  userDataPath: string,
): string =>
  join(
    governanceIntegrityDirectoryPath(userDataPath),
    GOVERNANCE_VALIDATION_FEE_FINALITY_MARKER_FILENAME,
  );

export const deriveGovernanceValidationFeeImmutableLedgerScope = (
  config: GovernanceValidationFeeEnabledConfig,
): GovernanceValidationFeeImmutableLedgerScope => {
  const identity = JSON.stringify({
    chainId: config.ledgerBinding.chainId,
    genesisHash: config.ledgerBinding.genesisHash,
    policyChainGenesisHash: config.ledgerBinding.policyChainGenesisHash,
  });
  return createHash("sha256")
    .update(TRUST_SCOPE_DOMAIN, "utf8")
    .update(identity, "utf8")
    .digest("hex") as GovernanceValidationFeeImmutableLedgerScope;
};

export const assertGovernanceValidationFeeTrustedSender = (
  input: GovernanceValidationFeeTrustedSenderCheck,
): void => {
  if (input.requestPayload !== undefined) {
    throw new Error(
      "Governance validation-fee policy reads do not accept renderer-supplied finality data.",
    );
  }
  if (
    !input.ownerMatchesMainWindow ||
    input.ownerDestroyed ||
    !input.senderFrame ||
    input.senderFrame !== input.mainFrame ||
    !sameTrustedRendererOrigin(input.senderFrame.url, input.trustedRendererUrl)
  ) {
    throw new Error(
      "Governance validation-fee policy reads require the trusted top-level wallet frame.",
    );
  }
};

export class GovernanceValidationFeeFinalityStore {
  private readonly path: string;
  private readonly markerPath: string;
  private readonly inProcessFloor = new Map<string, StoredObservation>();
  private initialized = false;

  constructor(userDataPath: string) {
    this.path = governanceValidationFeeFinalityPath(userDataPath);
    this.markerPath = governanceValidationFeeFinalityMarkerPath(userDataPath);
  }

  verifyAndPromote(
    immutableLedgerScope: GovernanceValidationFeeImmutableLedgerScope,
    value: unknown,
  ): void {
    const scope = exactHash(
      immutableLedgerScope,
      "Governance validation-fee immutable ledger scope",
    );
    const current = parseObservation(
      value,
      "Governance validation-fee finality observation",
    );
    const state = this.load();
    this.assertDurableStateCoversInProcessFloor(state);
    this.hydrateInProcessFloor(state);
    const previous = state.observations[scope];
    if (previous) rejectRegressionOrEquivocation(previous, current);
    if (previous && observationsEqual(previous, current)) return;
    if (
      !previous &&
      Object.keys(state.observations).length >= MAX_TRUST_SCOPES
    ) {
      throw new Error(
        `${FINALITY_STATE_LABEL} cannot discard a durable immutable ledger scope to make room for another.`,
      );
    }

    const stored: StoredObservation = Object.freeze({ ...current });
    const next = Object.freeze({
      schema: GOVERNANCE_VALIDATION_FEE_FINALITY_SCHEMA,
      observations: Object.freeze({
        ...state.observations,
        [scope]: stored,
      }),
    });
    this.persist(next, Object.keys(state.observations).length === 0);
    this.inProcessFloor.set(scope, stored);
  }

  private load(): FinalityState {
    const hasState = pathExists(this.path, FINALITY_STATE_LABEL);
    const hasMarker = pathExists(this.markerPath, FINALITY_MARKER_LABEL);
    if (!hasState && !hasMarker) {
      if (this.initialized || this.inProcessFloor.size > 0) {
        throw new Error(
          `${FINALITY_STATE_LABEL} disappeared after initialization; refusing to reset the durable watermark.`,
        );
      }
      return emptyState();
    }
    if (!hasState || !hasMarker) {
      throw new Error(
        `${FINALITY_STATE_LABEL} is incomplete or disappeared after initialization.`,
      );
    }

    const marker = loadSecureBoundedJson(this.markerPath, {
      label: FINALITY_MARKER_LABEL,
      maximumBytes: MAX_FINALITY_MARKER_BYTES,
    });
    parseMarker(marker.value);
    if (marker.sha256 !== sha256(canonicalMarker())) {
      throw new Error(
        `${FINALITY_MARKER_LABEL} is not in its exact canonical encoding.`,
      );
    }

    const loaded = loadSecureBoundedJson(this.path, {
      label: FINALITY_STATE_LABEL,
      maximumBytes: MAX_FINALITY_STATE_BYTES,
    });
    const state = parseState(loaded.value);
    if (Object.keys(state.observations).length === 0) {
      throw new Error(
        `${FINALITY_STATE_LABEL} cannot be empty after initialization.`,
      );
    }
    if (loaded.sha256 !== sha256(canonicalState(state))) {
      throw new Error(
        `${FINALITY_STATE_LABEL} is not in its exact canonical encoding.`,
      );
    }
    this.initialized = true;
    return state;
  }

  private assertDurableStateCoversInProcessFloor(state: FinalityState): void {
    for (const [scope, floor] of this.inProcessFloor) {
      const durable = state.observations[scope];
      if (!durable) {
        throw new Error(
          `${FINALITY_STATE_LABEL} discarded an in-process immutable ledger watermark.`,
        );
      }
      rejectRegressionOrEquivocation(floor, durable);
    }
  }

  private hydrateInProcessFloor(state: FinalityState): void {
    for (const [scope, observation] of Object.entries(state.observations)) {
      this.inProcessFloor.set(scope, observation);
    }
  }

  private persist(state: FinalityState, firstPromotion: boolean): void {
    if (firstPromotion) this.initialized = true;
    secureWriteBoundedFile(
      this.path,
      Buffer.from(canonicalState(state), "utf8"),
      {
        label: FINALITY_STATE_LABEL,
        maximumBytes: MAX_FINALITY_STATE_BYTES,
      },
    );
    if (firstPromotion) {
      secureWriteBoundedFile(
        this.markerPath,
        Buffer.from(canonicalMarker(), "utf8"),
        {
          label: FINALITY_MARKER_LABEL,
          maximumBytes: MAX_FINALITY_MARKER_BYTES,
        },
      );
    } else if (!pathExists(this.markerPath, FINALITY_MARKER_LABEL)) {
      throw new Error(`${FINALITY_MARKER_LABEL} disappeared during promotion.`);
    }
  }
}

export const fetchGovernanceValidationFeePolicyInMain = async (input: {
  runtimeConfig: GovernanceValidationFeeRuntimeCoordinates;
  finalityStore: GovernanceValidationFeeFinalityStore;
  fetcher?: GovernanceValidationFeeCoreFetch;
  signal?: AbortSignal;
}): Promise<GovernanceValidationFeePolicyView> => {
  const immutableLedgerScope =
    deriveGovernanceValidationFeeImmutableLedgerScope(
      input.runtimeConfig.validationFee,
    );
  return fetchGovernanceValidationFeePolicy({
    config: input.runtimeConfig.validationFee,
    coreApiBaseUrl: input.runtimeConfig.cbsiCoreApiBaseUrl,
    fetcher: input.fetcher,
    signal: input.signal,
    promoteFinality: (observation) =>
      input.finalityStore.verifyAndPromote(immutableLedgerScope, observation),
  });
};
