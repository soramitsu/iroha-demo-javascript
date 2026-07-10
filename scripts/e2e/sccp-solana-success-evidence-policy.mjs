export const CANONICAL_SOLANA_TESTNET_RPC_URL =
  "https://api.testnet.solana.com";

export const CANONICAL_TAIRA_VALIDATOR_ROOTS = Object.freeze(
  [1, 2, 3, 4].map((index) => `https://taira-validator-${index}.sora.org`),
);

const ownDataValue = (record, key) => {
  if (!record || (typeof record !== "object" && typeof record !== "function")) {
    return undefined;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor &&
      Object.prototype.hasOwnProperty.call(descriptor, "value")
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
};

const normalizeRootHttpsEndpoint = (value, label) => {
  let raw;
  try {
    raw = String(value ?? "").trim();
  } catch {
    return { value: null, error: `${label} is invalid.` };
  }
  if (!raw) {
    return { value: null, error: `${label} is missing.` };
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") {
      return { value: null, error: `${label} must use HTTPS.` };
    }
    if (url.username || url.password) {
      return { value: null, error: `${label} must not include credentials.` };
    }
    if (url.port) {
      return { value: null, error: `${label} must not use a custom port.` };
    }
    if (url.search || url.hash) {
      return {
        value: null,
        error: `${label} must not include a query string or fragment.`,
      };
    }
    if (url.pathname !== "/" && url.pathname !== "") {
      return { value: null, error: `${label} must be an origin root.` };
    }
    return { value: url.origin, error: null };
  } catch {
    return {
      value: null,
      error: `${label} is invalid.`,
    };
  }
};

const problem = (id, detail) => ({ id, detail });

export const buildSccpSolanaSuccessNetworkPolicy = (options = {}) => {
  const torii = normalizeRootHttpsEndpoint(
    ownDataValue(options, "toriiUrl"),
    "TAIRA success-evidence endpoint",
  );
  const solana = normalizeRootHttpsEndpoint(
    ownDataValue(options, "solanaRpcUrl"),
    "Solana success-evidence RPC",
  );
  const prerequisiteReportOverrideIds = Array.isArray(
    ownDataValue(options, "prerequisiteReportOverrideIds"),
  )
    ? ownDataValue(options, "prerequisiteReportOverrideIds")
        .filter((id) => typeof id === "string" && id.trim())
        .map((id) => id.trim())
        .sort()
    : [];
  const preflightReportOverride =
    ownDataValue(options, "preflightReportOverride") === true;
  const injectedReadbackOverride =
    ownDataValue(options, "injectedReadbackOverride") === true;
  const rawSkipSolanaRpc = ownDataValue(options, "skipSolanaRpc");
  const skipSolanaRpc = rawSkipSolanaRpc === true;
  const governancePinnedToriiUrl = normalizeRootHttpsEndpoint(
    ownDataValue(options, "governancePinnedToriiUrl"),
    "Governance-pinned TAIRA endpoint",
  );
  const requireGovernancePin =
    ownDataValue(options, "requireGovernancePin") === true;
  const governancePinReady =
    ownDataValue(options, "governancePinReady") === true;
  const problems = [];

  if (torii.error) {
    problems.push(problem("canonical-taira-validator-root", torii.error));
  } else if (!CANONICAL_TAIRA_VALIDATOR_ROOTS.includes(torii.value)) {
    problems.push(
      problem(
        "canonical-taira-validator-root",
        `TAIRA success evidence must use one of the governance-approved canonical validator roots: ${CANONICAL_TAIRA_VALIDATOR_ROOTS.join(", ")}.`,
      ),
    );
  }

  if (solana.error) {
    problems.push(problem("canonical-solana-testnet-rpc", solana.error));
  } else if (solana.value !== CANONICAL_SOLANA_TESTNET_RPC_URL) {
    problems.push(
      problem(
        "canonical-solana-testnet-rpc",
        `Solana success evidence must use ${CANONICAL_SOLANA_TESTNET_RPC_URL}.`,
      ),
    );
  }

  if (skipSolanaRpc) {
    problems.push(
      problem(
        "solana-rpc-not-skipped",
        "Solana RPC checks cannot be skipped for success evidence.",
      ),
    );
  }
  if (
    rawSkipSolanaRpc !== undefined &&
    rawSkipSolanaRpc !== true &&
    rawSkipSolanaRpc !== false
  ) {
    problems.push(
      problem(
        "solana-rpc-skip-option-invalid",
        "The success-evidence RPC skip option must be a boolean and must be false.",
      ),
    );
  }
  if (preflightReportOverride) {
    problems.push(
      problem(
        "fresh-public-preflight",
        "A supplied preflight report is diagnostic input only and cannot qualify as success evidence.",
      ),
    );
  }
  if (prerequisiteReportOverrideIds.length > 0) {
    problems.push(
      problem(
        "fresh-production-prerequisites",
        `Supplied prerequisite reports are diagnostic input only: ${prerequisiteReportOverrideIds.join(", ")}.`,
      ),
    );
  }
  if (injectedReadbackOverride) {
    problems.push(
      problem(
        "native-read-only-network-clients",
        "Injected fetch/readback clients are test diagnostics and cannot qualify as success evidence.",
      ),
    );
  }

  if (requireGovernancePin) {
    if (governancePinnedToriiUrl.error) {
      problems.push(
        problem(
          "governance-pinned-taira-validator-root",
          governancePinnedToriiUrl.error,
        ),
      );
    } else if (
      !CANONICAL_TAIRA_VALIDATOR_ROOTS.includes(
        governancePinnedToriiUrl.value,
      ) ||
      governancePinnedToriiUrl.value !== torii.value ||
      !governancePinReady
    ) {
      problems.push(
        problem(
          "governance-pinned-taira-validator-root",
          "The freshly queried TAIRA validator root must exactly match the canonical rollout target pinned by the production publication package.",
        ),
      );
    }
  }

  return {
    schema: "iroha-demo-sccp-solana-success-network-policy/v1",
    ready: problems.length === 0,
    readOnly: true,
    freshPreflightRequired: true,
    nativeNetworkClientsRequired: true,
    skipSolanaRpc,
    preflightReportOverride,
    prerequisiteReportOverrideIds,
    injectedReadbackOverride,
    toriiUrl: torii.value,
    solanaRpcUrl: solana.value,
    canonicalTairaValidatorRoot:
      Boolean(torii.value) &&
      CANONICAL_TAIRA_VALIDATOR_ROOTS.includes(torii.value),
    canonicalSolanaTestnetRpc:
      solana.value === CANONICAL_SOLANA_TESTNET_RPC_URL,
    governancePinRequired: requireGovernancePin,
    governancePinnedToriiUrl: governancePinnedToriiUrl.value,
    governancePinReady:
      requireGovernancePin &&
      governancePinReady &&
      governancePinnedToriiUrl.value === torii.value,
    problems,
  };
};
