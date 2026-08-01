/* global BigInt, globalThis */

import { createHash } from "node:crypto";
import { normalizeSccpRouteGovernanceAction } from "@iroha/iroha-js";
import { AccountAddress } from "@iroha/iroha-js/address";
import {
  SOLANA_SCCP_REGISTRY_PATH,
  canonicalSccpObjectSha256,
  canonicalSccpJson,
  selectExactSolanaRegistryRoute,
  summarizeExactSolanaRegistryRoute,
  validateSolanaRouteGovernancePlan,
} from "./sccp-solana-exact-registry.mjs";
import {
  checkSolanaOrderedInitializationAgainstRegistry,
  solanaOrderedProgramArtifactSha256,
  validateSolanaOrderedInitializationEvidence,
  validateSolanaOrderedInitializationRpcVerification,
} from "./sccp-solana-ordered-initialization.mjs";
import { parseSolanaGovernanceDuplicateFreeJsonText } from "./sccp-solana-governance-json.mjs";
import { evaluateTairaSccpGovernancePhase } from "../taira-sccp-route-governance.mjs";

const HASH32 = /^0x[0-9a-f]{64}$/u;
const TRANSACTION_HASH = /^[0-9a-f]{64}$/u;
const PROPOSAL_ID = /^[0-9a-f]{64}$/u;
const PHASES = new Set(["register", "activate"]);
const TERMINAL_TRANSACTION_STATUSES = new Set([
  "Applied",
  "Rejected",
  "Expired",
]);
const GOVERNANCE_INSTRUCTION_WIRE_ID =
  "iroha_data_model::isi::governance::ProposeSccpRouteGovernance";
const MAX_READBACK_BYTES = 32 * 1024 * 1024;
const DEFAULT_READBACK_TIMEOUT_MS = 20_000;
const TAIRA_VALIDATOR_HOST = /^taira-validator-[1-4]\.sora\.org$/u;
const TAIRA_NETWORK_PREFIX = 369;
const GOVERNANCE_SUBMISSION_NEXT_ACTION =
  "Parliament must enact this proposal; verify typed registry readback before the next phase.";
const GOVERNANCE_SUBMISSION_FIELDS = Object.freeze([
  "schema",
  "checked_at",
  "phase",
  "plan_sha256",
  "ordered_initialization_evidence_sha256",
  "fresh_deploy_report_sha256",
  "torii_url",
  "authority",
  "submitted",
  "already_enacted",
  "proposal_id",
  "transaction_hash",
  "instruction_wire_id",
  "instruction_payload_sha256",
  "status",
  "next_required_action",
]);

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const nonzeroHash32 = (value) =>
  typeof value === "string" && HASH32.test(value) && !/^0x0{64}$/u.test(value);

const containsSecretField = (value) => {
  if (Array.isArray(value)) return value.some(containsSecretField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) =>
      /(?:private|secret|mnemonic|seed|credential|wallet.?connect)/iu.test(
        key,
      ) || containsSecretField(child),
  );
};

const exactRouteHashes = (summary) => ({
  destination_binding_hash: summary?.destinationBindingHash ?? null,
  deployment_config_hash: summary?.deploymentConfigHash ?? null,
  route_configuration_hash: summary?.routeConfigurationHash ?? null,
  source_emitter_identity_hash: summary?.sourceEmitterIdentityHash ?? null,
  source_identity_hash: summary?.sourceIdentityHash ?? null,
});

const makeCheck = (id, ok, detail, evidence = undefined) => ({
  id,
  status: ok ? "pass" : "fail",
  detail,
  ...(evidence === undefined ? {} : { evidence }),
});

const terminalTransactionStatuses = (value, seen = new WeakSet()) => {
  const found = new Set();
  const visit = (candidate) => {
    if (typeof candidate === "string") {
      if (TERMINAL_TRANSACTION_STATUSES.has(candidate)) found.add(candidate);
      return;
    }
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      seen.has(candidate)
    ) {
      return;
    }
    seen.add(candidate);
    if (Array.isArray(candidate)) {
      for (const entry of candidate) visit(entry);
      return;
    }
    for (const [key, entry] of Object.entries(candidate)) {
      if (
        ["kind", "status", "content", "result", "receipt", "raw"].includes(key)
      ) {
        visit(entry);
      }
    }
  };
  visit(value);
  return found;
};

const requireAppliedTransactionStatus = (value, label) => {
  const statuses = terminalTransactionStatuses(value);
  if (statuses.size !== 1 || !statuses.has("Applied")) {
    throw new TypeError(
      `${label} must report the exact terminal Applied status.`,
    );
  }
  return "Applied";
};

const exactPositiveInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
  return value;
};

const exactJson = (left, right) =>
  canonicalSccpJson(left) === canonicalSccpJson(right);

const hasExactKeys = (value, expected) =>
  isRecord(value) && exactJson(Object.keys(value).sort(), [...expected].sort());

const governanceInstructionIdentity = (proposal) => {
  return Object.freeze({
    wireId: GOVERNANCE_INSTRUCTION_WIRE_ID,
    proposal,
  });
};

const readResponseBody = async (response, label, maxBytes) => {
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/iu.test(contentType)) {
    throw new Error(`${label} returned a non-JSON content type.`);
  }
  const declaredLength = response.headers?.get?.("content-length");
  if (
    declaredLength !== null &&
    declaredLength !== undefined &&
    (!/^(?:0|[1-9][0-9]*)$/u.test(declaredLength) ||
      BigInt(declaredLength) > BigInt(maxBytes))
  ) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte response limit.`);
  }
  const chunks = [];
  let total = 0;
  if (response.body !== null && response.body !== undefined) {
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error(
            `${label} exceeds the ${maxBytes}-byte response limit.`,
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  } else {
    const text = await response.text();
    total = Buffer.byteLength(text, "utf8");
    if (total > maxBytes) {
      throw new Error(`${label} exceeds the ${maxBytes}-byte response limit.`);
    }
    chunks.push(Buffer.from(text, "utf8"));
  }
  const bytes = Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    total,
  );
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return parseSolanaGovernanceDuplicateFreeJsonText(text, label);
  } catch {
    throw new Error(`${label} did not return valid duplicate-free JSON.`);
  }
};

const fetchReadOnlyJson = async (
  url,
  { fetchImpl, timeoutMs, label, maxBytes = MAX_READBACK_BYTES, headers = {} },
) => {
  if (typeof fetchImpl !== "function") {
    throw new TypeError(
      "Live governance readback requires a fetch implementation.",
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json", ...headers },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response || response.ok !== true || response.status !== 200) {
      throw new Error(
        `${label} returned HTTP ${response?.status ?? "unknown"}.`,
      );
    }
    return await readResponseBody(response, label, maxBytes);
  } catch (error) {
    throw new Error(
      `${label} failed: ${error instanceof Error ? error.message : String(error)}.`,
    );
  } finally {
    clearTimeout(timer);
  }
};

const pipelineHashAndAuthority = (payload) => {
  if (!isRecord(payload)) {
    throw new TypeError("Pipeline transaction readback must be an object.");
  }
  const content = isRecord(payload.content) ? payload.content : payload;
  return {
    hash: content.hash ?? payload.hash ?? payload.hashHex ?? null,
    authority: content.authority ?? payload.authority ?? null,
  };
};

const validateGovernanceProposalReadback = (
  payload,
  { expectedAction, expectedAuthority },
) => {
  if (
    !isRecord(payload) ||
    payload.found !== true ||
    !isRecord(payload.proposal)
  ) {
    throw new TypeError(
      "Governance proposal readback is missing the proposal.",
    );
  }
  const proposal = payload.proposal;
  if (
    proposal.proposer !== expectedAuthority ||
    proposal.status !== "Enacted" ||
    !isRecord(proposal.kind) ||
    Object.keys(proposal.kind).length !== 1 ||
    !isRecord(proposal.kind.SccpRouteGovernance) ||
    Object.keys(proposal.kind.SccpRouteGovernance).length !== 1 ||
    !("action" in proposal.kind.SccpRouteGovernance)
  ) {
    throw new TypeError(
      "Governance proposal readback is not the exact enacted SCCP proposal from the receipt authority.",
    );
  }
  const action = normalizeSccpRouteGovernanceAction(
    proposal.kind.SccpRouteGovernance.action,
  );
  if (!exactJson(action, expectedAction)) {
    throw new TypeError(
      "Governance proposal readback action differs from the reviewed phase.",
    );
  }
  return { status: proposal.status, action };
};

const validateExplorerTransactionReadback = (
  payload,
  { receipt, plan, phase },
) => {
  if (!isRecord(payload)) {
    throw new TypeError("Explorer transaction readback must be an object.");
  }
  const expectedMetadata = {
    action: "propose_sccp_route_governance",
    route_id: plan.route_id,
    asset_key: plan.asset_key,
    route_revision: plan.revision,
    governance_phase: phase,
    governance_proposal_id: receipt.proposalId,
    reviewed_plan_sha256: plan.plan_sha256,
    fresh_deploy_report_sha256: plan.fresh_deploy_report_sha256,
    ordered_initialization_evidence_sha256:
      plan.ordered_initialization_evidence_sha256,
  };
  if (
    payload.hash !== receipt.transactionHash ||
    payload.authority !== receipt.authority ||
    payload.status !== "Committed" ||
    payload.rejection_reason !== null ||
    payload.executable !== "Instructions" ||
    payload.executable_payload?.instruction_count !== 1 ||
    !exactJson(payload.metadata, expectedMetadata)
  ) {
    throw new TypeError(
      `Explorer transaction readback does not bind the exact ${phase} proposal, reviewed plan, authority, and single instruction.`,
    );
  }
  return {
    block: exactPositiveInteger(payload.block, "Explorer transaction block"),
    metadata: expectedMetadata,
  };
};

const validateExplorerInstructionReadback = (
  payload,
  { receipt, transaction, instructionIdentity },
) => {
  const box = payload?.box;
  const json = box?.json;
  const structuredPayload = json?.payload;
  if (
    !isRecord(payload) ||
    payload.transaction_hash !== receipt.transactionHash ||
    payload.transaction_status !== "Committed" ||
    payload.authority !== receipt.authority ||
    payload.block !== transaction.block ||
    payload.index !== 0 ||
    payload.kind !== "ProposeSccpRouteGovernance" ||
    !isRecord(box) ||
    !hasExactKeys(box, ["encoded", "framed_sha256", "json"]) ||
    typeof box.encoded !== "string" ||
    !/^0x[0-9a-f]+$/u.test(box.encoded) ||
    box.encoded.length <= 2 ||
    box.encoded.length % 2 !== 0 ||
    box.framed_sha256 !== receipt.instructionPayloadSha256 ||
    !isRecord(json) ||
    !hasExactKeys(json, ["kind", "payload", "wire_id", "encoded"]) ||
    json.kind !== "Custom" ||
    json.wire_id !== instructionIdentity.wireId ||
    json.encoded !== box.encoded.slice(2) ||
    !isRecord(structuredPayload) ||
    !hasExactKeys(structuredPayload, ["variant", "value"]) ||
    structuredPayload.variant !== "ProposeSccpRouteGovernance" ||
    !exactJson(structuredPayload.value, instructionIdentity.proposal)
  ) {
    throw new TypeError(
      "Explorer instruction readback differs from the exact reviewed governance instruction.",
    );
  }
  return {
    wireId: instructionIdentity.wireId,
    encodedSha256: `0x${createHash("sha256")
      .update(Buffer.from(box.encoded.slice(2), "hex"))
      .digest("hex")}`,
    framedSha256: box.framed_sha256,
  };
};

/**
 * Fetch and verify committed, finalized TAIRA evidence for one governance
 * receipt. Every network operation is a GET; caller-supplied readback objects
 * are intentionally unsupported.
 */
export const verifySolanaGovernanceSubmissionReadback = async ({
  plan,
  phase,
  receipt,
  toriiUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_READBACK_TIMEOUT_MS,
}) => {
  if (!PHASES.has(phase) || !isRecord(plan) || !isRecord(receipt)) {
    throw new TypeError("Live governance readback identity is invalid.");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Live governance readback timeout must be positive.");
  }
  const expectedProposal =
    phase === "register" ? plan.registration : plan.activation;
  const instructionIdentity = governanceInstructionIdentity(expectedProposal);
  const base = new URL(toriiUrl);
  if (
    base.protocol !== "https:" ||
    !TAIRA_VALIDATOR_HOST.test(base.hostname) ||
    base.username ||
    base.password ||
    base.port ||
    (base.pathname !== "/" && base.pathname !== "") ||
    base.search ||
    base.hash
  ) {
    throw new TypeError(
      "Live governance readback requires an explicit canonical TAIRA validator HTTPS root.",
    );
  }
  const pipelineUrl = new URL("/v1/pipeline/transactions/status", base);
  pipelineUrl.searchParams.set("hash", receipt.transactionHash);
  pipelineUrl.searchParams.set("scope", "global");
  const [
    pipeline,
    transactionPayload,
    instructionPayload,
    proposalPayload,
    metrics,
  ] = await Promise.all([
    fetchReadOnlyJson(pipelineUrl, {
      fetchImpl,
      timeoutMs,
      label: `Solana ${phase} pipeline transaction readback`,
    }),
    fetchReadOnlyJson(
      new URL(`/v1/explorer/transactions/${receipt.transactionHash}`, base),
      {
        fetchImpl,
        timeoutMs,
        label: `Solana ${phase} explorer transaction readback`,
      },
    ),
    fetchReadOnlyJson(
      new URL(`/v1/explorer/instructions/${receipt.transactionHash}/0`, base),
      {
        fetchImpl,
        timeoutMs,
        label: `Solana ${phase} explorer instruction readback`,
      },
    ),
    fetchReadOnlyJson(
      new URL(`/v1/gov/proposals/${receipt.proposalId}`, base),
      {
        fetchImpl,
        timeoutMs,
        label: `Solana ${phase} governance proposal readback`,
      },
    ),
    fetchReadOnlyJson(new URL("/v1/explorer/metrics", base), {
      fetchImpl,
      timeoutMs,
      label: `Solana ${phase} finalized-height readback`,
    }),
  ]);

  for (const [label, payload] of [
    ["pipeline transaction", pipeline],
    ["explorer transaction", transactionPayload],
    ["explorer instruction", instructionPayload],
    ["governance proposal", proposalPayload],
    ["explorer metrics", metrics],
  ]) {
    if (containsSecretField(payload)) {
      throw new TypeError(
        `Solana ${phase} ${label} readback unexpectedly contained a secret-bearing field.`,
      );
    }
  }

  requireAppliedTransactionStatus(
    pipeline,
    `Solana ${phase} pipeline transaction readback`,
  );
  const pipelineIdentity = pipelineHashAndAuthority(pipeline);
  if (
    pipelineIdentity.hash !== receipt.transactionHash ||
    (pipelineIdentity.authority !== null &&
      pipelineIdentity.authority !== receipt.authority)
  ) {
    throw new TypeError(
      `Solana ${phase} pipeline readback hash or authority drifted from the receipt.`,
    );
  }
  const transaction = validateExplorerTransactionReadback(transactionPayload, {
    receipt,
    plan,
    phase,
  });
  const instruction = validateExplorerInstructionReadback(instructionPayload, {
    receipt,
    transaction,
    instructionIdentity,
  });
  const proposal = validateGovernanceProposalReadback(proposalPayload, {
    expectedAction: expectedProposal.action,
    expectedAuthority: receipt.authority,
  });
  const finalizedBlock = exactPositiveInteger(
    metrics?.finalized_block,
    "Explorer finalized block",
  );
  if (finalizedBlock < transaction.block) {
    throw new TypeError(
      `Solana ${phase} governance transaction is not finalized yet.`,
    );
  }
  return Object.freeze({
    phase,
    transactionHash: receipt.transactionHash,
    proposalId: receipt.proposalId,
    authority: receipt.authority,
    block: transaction.block,
    finalizedBlock,
    instruction,
    proposalStatus: proposal.status,
  });
};

/**
 * Validate one non-secret governance submission receipt. A dry-run draft is
 * intentionally insufficient for production evidence: the original submitted
 * proposal receipt must be retained. A later "already enacted" observation is
 * useful diagnostically but cannot replace transaction provenance. Public
 * typed-registry readback remains the current-state enactment authority.
 */
export const validateSolanaGovernanceSubmissionEvidence = (
  value,
  {
    phase,
    planSha256,
    orderedInitializationEvidenceSha256,
    freshDeployReportSha256,
    toriiUrl,
  },
) => {
  if (!PHASES.has(phase)) {
    throw new TypeError("Solana governance evidence phase is invalid.");
  }
  if (!isRecord(value) || containsSecretField(value)) {
    throw new TypeError(
      "Solana governance submission evidence must be a non-secret object.",
    );
  }
  const receiptFields = Object.keys(value).sort();
  const ordinaryFields = [...GOVERNANCE_SUBMISSION_FIELDS].sort();
  const recoveredFields = [
    ...GOVERNANCE_SUBMISSION_FIELDS,
    "recovered_from_durable_intent",
  ].sort();
  const ordinaryReceipt = exactJson(receiptFields, ordinaryFields);
  const recoveredReceipt = exactJson(receiptFields, recoveredFields);
  if (!ordinaryReceipt && !recoveredReceipt) {
    throw new TypeError(
      `Solana ${phase} governance submission evidence contains an unknown or missing field.`,
    );
  }
  if (
    value.schema !== "iroha-sccp-route-governance-submission/v1" ||
    value.phase !== phase ||
    value.plan_sha256 !== planSha256 ||
    value.ordered_initialization_evidence_sha256 !==
      orderedInitializationEvidenceSha256 ||
    !nonzeroHash32(freshDeployReportSha256) ||
    value.fresh_deploy_report_sha256 !== freshDeployReportSha256 ||
    value.torii_url !== toriiUrl
  ) {
    throw new TypeError(
      `Solana ${phase} governance evidence identity does not match the reviewed plan and endpoint.`,
    );
  }
  const submitted = value.submitted === true;
  const alreadyEnacted = value.already_enacted === true;
  if (submitted !== true || alreadyEnacted !== false) {
    throw new TypeError(
      `Solana ${phase} production evidence must retain its submitted Parliament transaction; an already-enacted observation alone is insufficient provenance.`,
    );
  }
  if (
    typeof value.checked_at !== "string" ||
    !Number.isFinite(Date.parse(value.checked_at)) ||
    new Date(value.checked_at).toISOString() !== value.checked_at ||
    value.next_required_action !== GOVERNANCE_SUBMISSION_NEXT_ACTION ||
    (recoveredReceipt && value.recovered_from_durable_intent !== true)
  ) {
    throw new TypeError(
      `Solana ${phase} governance submission evidence fields are not exact.`,
    );
  }
  if (
    typeof value.authority !== "string" ||
    value.authority.length === 0 ||
    value.authority !== value.authority.trim() ||
    typeof value.proposal_id !== "string" ||
    !PROPOSAL_ID.test(value.proposal_id) ||
    /^0{64}$/u.test(value.proposal_id) ||
    typeof value.transaction_hash !== "string" ||
    !TRANSACTION_HASH.test(value.transaction_hash) ||
    /^0{64}$/u.test(value.transaction_hash) ||
    value.instruction_wire_id !== GOVERNANCE_INSTRUCTION_WIRE_ID ||
    !nonzeroHash32(value.instruction_payload_sha256) ||
    value.status === null ||
    value.status === undefined
  ) {
    throw new TypeError(
      `Submitted Solana ${phase} governance evidence is missing its applied proposal transaction.`,
    );
  }
  let canonicalAuthority;
  try {
    canonicalAuthority = AccountAddress.fromAccountId(
      value.authority,
      TAIRA_NETWORK_PREFIX,
    ).toI105(TAIRA_NETWORK_PREFIX);
  } catch {
    throw new TypeError(
      `Submitted Solana ${phase} governance authority is not a canonical TAIRA account.`,
    );
  }
  if (
    canonicalAuthority !== value.authority ||
    !canonicalAuthority.startsWith("testu")
  ) {
    throw new TypeError(
      `Submitted Solana ${phase} governance authority is not a canonical TAIRA account.`,
    );
  }
  requireAppliedTransactionStatus(
    value.status,
    `Submitted Solana ${phase} governance evidence`,
  );
  const statusIdentity = pipelineHashAndAuthority(value.status);
  if (
    statusIdentity.hash !== value.transaction_hash ||
    (statusIdentity.authority !== null &&
      statusIdentity.authority !== value.authority)
  ) {
    throw new TypeError(
      `Submitted Solana ${phase} governance status does not bind the receipt transaction hash and authority.`,
    );
  }
  return Object.freeze({
    phase,
    submitted,
    alreadyEnacted,
    proposalId: value.proposal_id,
    transactionHash: value.transaction_hash,
    authority: value.authority,
    freshDeployReportSha256: value.fresh_deploy_report_sha256,
    instructionWireId: value.instruction_wire_id,
    instructionPayloadSha256: value.instruction_payload_sha256,
    status: "Applied",
    checkedAt: value.checked_at,
    recoveredFromDurableIntent: recoveredReceipt,
  });
};

/**
 * Bind independently pinned governance artifacts to a fresh public typed
 * registry readback. The registration and activation receipts are historical
 * provenance; the bidirectional registry state is the only enactment truth.
 */
export const buildSolanaGovernanceEvidenceChecks = async ({
  governancePlan,
  expectedPlanSha256,
  registrationResult,
  registrationArtifactSha256,
  expectedRegistrationArtifactSha256,
  activationResult,
  activationArtifactSha256,
  expectedActivationArtifactSha256,
  orderedInitializationEvidence,
  orderedInitializationArtifactSha256,
  expectedOrderedInitializationArtifactSha256,
  orderedInitializationRpcVerification,
  preflightReport,
  fetchImpl = globalThis.fetch,
  fetchTimeoutMs = DEFAULT_READBACK_TIMEOUT_MS,
}) => {
  let plan = null;
  let planError = null;
  try {
    ({ plan } = validateSolanaRouteGovernancePlan(governancePlan));
    if (
      !nonzeroHash32(expectedPlanSha256) ||
      plan.plan_sha256 !== expectedPlanSha256
    ) {
      throw new TypeError(
        "Governance plan does not match --governance-plan-sha256.",
      );
    }
  } catch (error) {
    planError = error instanceof Error ? error.message : String(error);
  }
  const planCheck = makeCheck(
    "governance-plan-reviewed",
    planError === null,
    planError ??
      "Reviewed exact Solana governance plan is canonical and pinned.",
    {
      expectedPlanSha256: expectedPlanSha256 ?? null,
      observedPlanSha256: governancePlan?.plan_sha256 ?? null,
      error: planError,
    },
  );

  const receiptCheck = async (
    phase,
    result,
    actualArtifactHash,
    expectedArtifactHash,
  ) => {
    let normalized = null;
    let error = null;
    try {
      if (!plan)
        throw new TypeError("Reviewed governance plan is unavailable.");
      if (
        !nonzeroHash32(actualArtifactHash) ||
        !nonzeroHash32(expectedArtifactHash) ||
        actualArtifactHash !== expectedArtifactHash
      ) {
        throw new TypeError(
          `Solana ${phase} governance result bytes are not independently pinned.`,
        );
      }
      normalized = validateSolanaGovernanceSubmissionEvidence(result, {
        phase,
        planSha256: plan.plan_sha256,
        orderedInitializationEvidenceSha256:
          plan.ordered_initialization_evidence_sha256,
        freshDeployReportSha256: plan.fresh_deploy_report_sha256,
        toriiUrl: preflightReport?.taira?.toriiUrl,
      });
      const liveReadback = await verifySolanaGovernanceSubmissionReadback({
        plan,
        phase,
        receipt: normalized,
        toriiUrl: preflightReport?.taira?.toriiUrl,
        fetchImpl,
        timeoutMs: fetchTimeoutMs,
      });
      normalized = Object.freeze({ ...normalized, liveReadback });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    return makeCheck(
      `governance-${phase}-evidence`,
      error === null,
      error ??
        `Pinned Solana ${phase} governance evidence matches independently fetched committed and finalized TAIRA readback.`,
      {
        artifactSha256: actualArtifactHash ?? null,
        expectedArtifactSha256: expectedArtifactHash ?? null,
        normalized,
        error,
      },
    );
  };

  const [registrationCheck, activationCheck] = await Promise.all([
    receiptCheck(
      "register",
      registrationResult,
      registrationArtifactSha256,
      expectedRegistrationArtifactSha256,
    ),
    receiptCheck(
      "activate",
      activationResult,
      activationArtifactSha256,
      expectedActivationArtifactSha256,
    ),
  ]);
  const registrationReceipt = registrationCheck.evidence?.normalized ?? null;
  const activationReceipt = activationCheck.evidence?.normalized ?? null;
  const distinctPhaseEvidence =
    registrationCheck.status === "pass" &&
    activationCheck.status === "pass" &&
    registrationArtifactSha256 !== activationArtifactSha256 &&
    registrationReceipt?.proposalId !== activationReceipt?.proposalId &&
    registrationReceipt?.transactionHash !== activationReceipt?.transactionHash;
  const distinctPhaseCheck = makeCheck(
    "governance-phases-distinct",
    distinctPhaseEvidence,
    distinctPhaseEvidence
      ? "Registration and activation are distinct submitted Parliament proposals and transactions."
      : "Registration and activation must be different byte-pinned Parliament proposals and transactions.",
    {
      registrationArtifactSha256: registrationArtifactSha256 ?? null,
      activationArtifactSha256: activationArtifactSha256 ?? null,
      registrationProposalId: registrationReceipt?.proposalId ?? null,
      activationProposalId: activationReceipt?.proposalId ?? null,
      registrationTransactionHash: registrationReceipt?.transactionHash ?? null,
      activationTransactionHash: activationReceipt?.transactionHash ?? null,
    },
  );

  let orderedInitializationError = null;
  let orderedInitializationSummary = null;
  try {
    if (!plan) throw new TypeError("Reviewed governance plan is unavailable.");
    if (
      !nonzeroHash32(orderedInitializationArtifactSha256) ||
      !nonzeroHash32(expectedOrderedInitializationArtifactSha256) ||
      orderedInitializationArtifactSha256 !==
        expectedOrderedInitializationArtifactSha256 ||
      orderedInitializationArtifactSha256 !==
        plan.ordered_initialization_evidence_sha256
    ) {
      throw new TypeError(
        "Ordered-initialization evidence bytes are not independently pinned by the governance plan.",
      );
    }
    const normalized = validateSolanaOrderedInitializationEvidence(
      orderedInitializationEvidence,
    );
    if (
      canonicalSccpObjectSha256(
        solanaOrderedProgramArtifactSha256(normalized),
      ) !== canonicalSccpObjectSha256(plan.program_artifact_sha256)
    ) {
      throw new TypeError(
        "Governance plan program artifact pins differ from ordered-initialization evidence.",
      );
    }
    orderedInitializationSummary =
      checkSolanaOrderedInitializationAgainstRegistry(
        normalized,
        preflightReport?.registrySummary,
      );
    validateSolanaOrderedInitializationRpcVerification(
      normalized,
      preflightReport?.registrySummary,
      orderedInitializationRpcVerification,
    );
  } catch (error) {
    orderedInitializationError =
      error instanceof Error ? error.message : String(error);
  }
  const orderedInitializationCheck = makeCheck(
    "governance-ordered-initialization-evidence",
    orderedInitializationError === null,
    orderedInitializationError ??
      "All three programs finalized before every account creation, material append/seal, and route initialization transaction.",
    {
      artifactSha256: orderedInitializationArtifactSha256 ?? null,
      expectedArtifactSha256:
        expectedOrderedInitializationArtifactSha256 ?? null,
      summary: orderedInitializationSummary,
      rpcTransactionCount:
        orderedInitializationRpcVerification?.transactions?.length ?? 0,
      error: orderedInitializationError,
    },
  );

  let readbackError = null;
  let readbackEvidence = null;
  try {
    if (!plan) throw new TypeError("Reviewed governance plan is unavailable.");
    if (
      preflightReport?.schema !== "iroha-demo-sccp-solana-route-preflight/v2" ||
      preflightReport?.protocolSource !== "typed-sccp-registry-v1" ||
      preflightReport?.manifestSource !== "public-registry" ||
      preflightReport?.registryState?.routePresent !== true ||
      preflightReport?.registryState?.activation !== "bidirectional"
    ) {
      throw new TypeError(
        "Fresh public typed-registry readback does not prove bidirectional enactment.",
      );
    }
    const toriiUrl = preflightReport?.taira?.toriiUrl;
    if (typeof toriiUrl !== "string" || toriiUrl.length === 0) {
      throw new TypeError(
        "Fresh public typed-registry readback requires the reviewed TAIRA endpoint.",
      );
    }
    const registryUrl = new URL(
      SOLANA_SCCP_REGISTRY_PATH,
      `${toriiUrl.replace(/\/+$/u, "")}/`,
    ).href;
    const liveRegistry = await fetchReadOnlyJson(registryUrl, {
      fetchImpl,
      timeoutMs: fetchTimeoutMs,
      label: "Fresh public typed SCCP registry readback",
      headers: {
        "cache-control": "no-cache, no-store, max-age=0",
        pragma: "no-cache",
      },
    });
    const phaseState = evaluateTairaSccpGovernancePhase({
      registry: liveRegistry,
      plan,
      phase: "activate",
    });
    if (
      phaseState.alreadyEnacted !== true ||
      phaseState.readyToPropose !== false
    ) {
      throw new TypeError(
        "Fresh public typed-registry readback does not contain the exact reviewed bidirectional route.",
      );
    }
    const liveSelection = selectExactSolanaRegistryRoute(liveRegistry, {
      requireBidirectional: true,
      requireCurrentTrustAnchor: true,
    });
    const liveSummary = summarizeExactSolanaRegistryRoute(liveRegistry, {
      requireBidirectional: true,
      requireCurrentTrustAnchor: true,
    });
    if (!exactJson(liveSummary, preflightReport.registrySummary)) {
      throw new TypeError(
        "Fresh public typed-registry readback differs from the preflight-pinned registry summary.",
      );
    }
    const observedHashes = exactRouteHashes(liveSummary);
    if (
      canonicalSccpObjectSha256(observedHashes) !==
      canonicalSccpObjectSha256(plan.route_hashes)
    ) {
      throw new TypeError(
        "Fresh public typed-registry route hashes differ from the reviewed governance plan.",
      );
    }
    const expectedAnchor =
      plan.registration?.action?.route?.native_trust_anchor?.anchor_hash;
    const observedAnchor = liveSummary.currentNativeTrustAnchorHash;
    if (
      !expectedAnchor ||
      observedAnchor !== expectedAnchor ||
      preflightReport.registryState.currentNativeTrustAnchorHash !==
        observedAnchor
    ) {
      throw new TypeError(
        "Fresh public typed-registry trust anchor differs from the reviewed governance plan.",
      );
    }
    if (!nonzeroHash32(liveSummary.registrySha256)) {
      throw new TypeError(
        "Fresh public typed-registry readback is missing its canonical registry hash.",
      );
    }
    readbackEvidence = {
      registrySha256: liveSummary.registrySha256,
      routeHashes: observedHashes,
      activation: preflightReport.registryState.activation,
      currentNativeTrustAnchorHash: observedAnchor,
      enactedRouteSha256: canonicalSccpObjectSha256(liveSelection.route),
      nativeTrustAnchorSha256: canonicalSccpObjectSha256(
        liveSelection.lane.native_trust_anchors.find(
          (anchor) => anchor.anchor_hash === observedAnchor,
        ),
      ),
    };
  } catch (error) {
    readbackError = error instanceof Error ? error.message : String(error);
  }
  const readbackCheck = makeCheck(
    "governance-enactment-readback",
    readbackError === null,
    readbackError ??
      "Fresh public typed registry exactly matches the reviewed bidirectional route.",
    { ...readbackEvidence, error: readbackError },
  );

  return Object.freeze({
    checks: Object.freeze([
      planCheck,
      orderedInitializationCheck,
      registrationCheck,
      activationCheck,
      distinctPhaseCheck,
      readbackCheck,
    ]),
    ready: [
      planCheck,
      orderedInitializationCheck,
      registrationCheck,
      activationCheck,
      distinctPhaseCheck,
      readbackCheck,
    ].every((check) => check.status === "pass"),
  });
};
