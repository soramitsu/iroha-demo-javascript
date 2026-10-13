import { describe, expect, it, vi } from "vitest";
import {
  appendRetailMaintenanceTier,
  canonicalGovernanceProposalId,
  canonicalValidationFeeQuantity,
  draftNextValidationFeePolicy,
  earliestValidationFeeActivationMs,
  removeRetailMaintenanceTier,
  validationFeeActivationChoices,
  formatHoniaraTimestamp,
  honiaraMonthStartsFrom,
  isHoniaraMonthStart,
  normalizeGovernanceProposalDetail,
  normalizeGovernanceProposalKind,
  normalizeGovernanceProposalList,
  normalizeValidationFeePayoutBinding,
  normalizeValidationFeePolicy,
  validateValidationFeePolicy,
  validationFeeActivationError,
  validationFeeEnactmentWindowError,
  HONIARA_LAST_NATIVE_MONTH_START_MS,
  VALIDATION_FEE_NOTICE_MS,
  type GovernanceProposalIdResolver,
  type ValidationFeePolicyPayload,
} from "@/governance/model";
import { TEST_TAIRA_NETWORK_ID as TAIRA_NETWORK_ID } from "./helpers/networkIdentityFixture";
import {
  EFFECTIVE_FROM_MS,
  NEXT_MONTH_START_MS,
  NOTICE_PUBLISHED_AT_MS,
  PROPOSAL_OPERATOR as OPERATOR,
  REFERENCE_PROVIDER_ACCOUNT_IDS,
  REWARD_POOL_ACCOUNT_ID,
  TREASURY_ACCOUNT_ID,
  retailSchedule,
  rewardCustody,
  validationFeePayoutBinding as payoutBinding,
  validationFeePolicy as policy,
} from "./helpers/validationFeeFixtures";

const id = (digit: string) => digit.repeat(64);
const HEAD_HASH = `${"ab".repeat(31)}ad`;

const lifecycleKind = () => ({
  kind: "ValidationFeePayoutLifecycle",
  payload: {
    proposal_operator: OPERATOR,
    payout_binding: payoutBinding(),
  },
});

const policyKind = () => ({
  kind: "ValidationFeePolicy",
  payload: {
    proposal_operator: OPERATOR,
    policy: policy(),
  },
});

const resolver: GovernanceProposalIdResolver = ({ kind }) =>
  kind.type === "ValidationFeePayoutLifecycle" ? id("1") : id("2");

const proposal = (
  kind: ReturnType<typeof lifecycleKind> | ReturnType<typeof policyKind>,
  overrides: Record<string, unknown> = {},
) => ({
  proposer: OPERATOR,
  kind,
  created_height: 100,
  status: "Proposed",
  ...overrides,
});

const nextRevision = (
  overrides: Record<string, unknown> = {},
): ValidationFeePolicyPayload =>
  normalizeValidationFeePolicy(
    policy({
      policy_version: "2",
      previous_policy_hash: HEAD_HASH.toUpperCase(),
      effective_from_ms: NEXT_MONTH_START_MS,
      notice_published_at_ms: EFFECTIVE_FROM_MS,
      ...overrides,
    }),
  );

const tiers = (...pairs: Array<[number, number]>) =>
  pairs.map(([minimum, fee]) => ({
    minimum_average_balance_minor: minimum,
    monthly_fee_minor: fee,
  }));

describe("current governance proposal model", () => {
  it("normalizes the exact operator-bound validation-fee kinds", () => {
    expect(normalizeGovernanceProposalKind(lifecycleKind())).toMatchObject({
      type: "ValidationFeePayoutLifecycle",
      proposalOperator: OPERATOR,
      payoutBinding: {
        code_hash: "34".repeat(32),
        reference_feed_id: ["xor_per_sbd"],
        max_slippage_bps: 100,
      },
    });
    const kind = normalizeGovernanceProposalKind(policyKind());
    expect(kind).toMatchObject({
      type: "ValidationFeePolicy",
      proposalOperator: OPERATOR,
      policy: {
        network_id: TAIRA_NETWORK_ID,
        charging_mode: {
          charging_mode: "RETAIL_MONTHLY_ALLOWANCE",
          value: null,
        },
        reward_custody: rewardCustody(),
      },
    });
    expect(kind).not.toHaveProperty("payoutLifecycleProposalId");
  });

  it("keeps the native field order for both validation-fee payloads", () => {
    expect(Object.keys(normalizeValidationFeePolicy(policy()))).toEqual(
      Object.keys(policy()),
    );
    expect(normalizeValidationFeePolicy(policy())).toEqual(policy());
    expect(
      Object.keys(normalizeValidationFeePayoutBinding(payoutBinding())),
    ).toEqual(Object.keys(payoutBinding()));
    expect(normalizeValidationFeePayoutBinding(payoutBinding())).toEqual(
      payoutBinding(),
    );
  });

  it("rejects retired policy, payout, and proposal fields", () => {
    for (const retired of [
      { chain_id: "retired" },
      { genesis_hash: id("e") },
      { effective_from_height: "121560" },
      { expires_after_height: null },
      { treasury_payout_binding: null },
      { plain_electorate_rules: {} },
    ]) {
      expect(() =>
        normalizeValidationFeePolicy({ ...policy(), ...retired }),
      ).toThrow(/exactly/);
    }
    for (const retired of [
      { batch_ds: "10" },
      { min_xor_out: "4" },
      { max_xor_out: "100" },
      { recipients: [] },
      { sbd_asset_id: "7ZepsJTHCVLKsrFFNZGSRGZgvBhv" },
    ]) {
      expect(() =>
        normalizeValidationFeePayoutBinding({ ...payoutBinding(), ...retired }),
      ).toThrow(/exactly/);
    }
    expect(() =>
      normalizeGovernanceProposalKind({
        ...policyKind(),
        payload: {
          ...policyKind().payload,
          payout_lifecycle_proposal_id: id("b"),
        },
      }),
    ).toThrow(/exactly/);
    expect(() =>
      normalizeGovernanceProposalKind({
        kind: "DeployContract",
        payload: { proposal_operator: OPERATOR },
      }),
    ).toThrow(/non-validation-fee/);
  });

  it("enforces the native policy field types and invariants", () => {
    expect(normalizeValidationFeePolicy(policy())).toMatchObject({
      network_id: TAIRA_NETWORK_ID,
      fee: "0.1",
      ds_scale: 2,
      exemption_classes: ["TREASURY_PAYOUT"],
    });
    const rejects = (overrides: Record<string, unknown>, pattern: RegExp) =>
      expect(() => normalizeValidationFeePolicy(policy(overrides))).toThrow(
        pattern,
      );
    rejects(
      { network_id: `hash:${id("0").toUpperCase()}#0000` },
      /canonical NetworkId/,
    );
    rejects({ policy_version: 1 }, /canonical unsigned decimal string/);
    rejects({ policy_version: "01" }, /canonical unsigned decimal string/);
    rejects({ policy_version: "2" }, /previous_policy_hash/);
    rejects({ previous_policy_hash: "AB".repeat(32) }, /previous_policy_hash/);
    rejects(
      { policy_version: "2", previous_policy_hash: "ab".repeat(32) },
      /uppercase hexadecimal/,
    );
    rejects(
      { policy_version: "2", previous_policy_hash: "00".repeat(32) },
      /non-zero/,
    );
    rejects(
      {
        charging_mode: {
          charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
          value: null,
        },
      },
      /RETAIL_MONTHLY_ALLOWANCE/,
    );
    rejects({ exemption_classes: [] }, /TREASURY_PAYOUT/);
    rejects({ ds_scale: 6 }, /scale 2/);
    rejects({ ds_asset_id: "5dHF5UNffENuEg9mhjYwY1jcZ1K5" }, /SBD asset/);
    rejects({ effective_from_ms: String(EFFECTIVE_FROM_MS) }, /JSON integer/);
    rejects({ notice_published_at_ms: 1.5 }, /JSON integer/);
    rejects({ effective_from_ms: Number.MAX_SAFE_INTEGER + 1 }, /JSON integer/);
    rejects({ treasury_account_id: REWARD_POOL_ACCOUNT_ID }, /reward custody/);
    rejects({ reward_custody: null }, /must be an object/);
    rejects(
      { reward_custody: { ...rewardCustody(), validator_lane_id: "0" } },
      /JSON integer/,
    );
    rejects(
      {
        reward_custody: {
          ...rewardCustody(),
          reward_pool_account_id: TREASURY_ACCOUNT_ID,
        },
      },
      /distinct treasury and reward pool/,
    );
  });

  it("requires canonical positive two-decimal fee quantities", () => {
    for (const fee of ["0.1", "0.05", "1", "12.5", "3.25"]) {
      expect(canonicalValidationFeeQuantity(fee)).toBe(fee);
    }
    for (const fee of [
      "0.10",
      "0.100",
      "0.001",
      "0",
      "0.0",
      "01",
      ".5",
      "-1",
      0.1,
    ]) {
      expect(() => canonicalValidationFeeQuantity(fee)).toThrow();
    }
  });

  it("bounds fee quantities by the native signed 512-bit mantissa domain", () => {
    // Native `Quantity`: <= 154 mantissa digits (155 text bytes) and a
    // mantissa below 2^511. Each case matches the built native binding.
    const limit = 1n << 511n;
    for (const fee of [
      (limit - 1n).toString(),
      `${((limit - 1n) / 10n).toString()}.1`,
      `6${"0".repeat(151)}.25`,
      `1${"0".repeat(152)}.5`,
    ]) {
      expect(canonicalValidationFeeQuantity(fee)).toBe(fee);
      expect(normalizeValidationFeePolicy(policy({ fee })).fee).toBe(fee);
    }
    for (const fee of [
      limit.toString(),
      "9".repeat(154),
      `7${"0".repeat(151)}.25`,
      "9".repeat(160),
      `1${"0".repeat(160)}`,
    ]) {
      expect(() => canonicalValidationFeeQuantity(fee)).toThrow(
        /canonical positive quantity|signed 512-bit quantity domain/,
      );
      expect(() => normalizeValidationFeePolicy(policy({ fee }))).toThrow();
    }
  });

  it("enforces the native retail schedule rules", () => {
    const withSchedule = (overrides: Record<string, unknown>) =>
      policy({ retail_schedule: { ...retailSchedule(), ...overrides } });
    for (const invalid of [
      { included_payments: 0 },
      { overage_minor: 0 },
      { included_payments: 0x1_0000_0000 },
      { maintenance_tiers: [] },
      {
        maintenance_tiers: tiers(
          ...Array.from({ length: 33 }, (_, index): [number, number] => [
            index,
            1,
          ]),
        ),
      },
      { maintenance_tiers: tiers([1, 100]) },
      { maintenance_tiers: tiers([0, 100], [0, 200]) },
      { maintenance_tiers: tiers([0, 200], [10, 100]) },
      { maintenance_tiers: tiers([0, 0]) },
      { enabled: false },
    ]) {
      expect(() =>
        normalizeValidationFeePolicy(withSchedule(invalid)),
      ).toThrow();
    }
    expect(
      normalizeValidationFeePolicy(
        withSchedule({ maintenance_tiers: tiers([0, 100], [10, 100]) }),
      ).retail_schedule.maintenance_tiers,
    ).toHaveLength(2);
  });

  it("requires a Honiara month start at least thirty days after notice", () => {
    expect(isHoniaraMonthStart(EFFECTIVE_FROM_MS)).toBe(true);
    expect(isHoniaraMonthStart(EFFECTIVE_FROM_MS + 1)).toBe(false);
    expect(isHoniaraMonthStart(EFFECTIVE_FROM_MS + 11 * 3_600_000)).toBe(false);
    expect(
      validationFeeActivationError(NOTICE_PUBLISHED_AT_MS, EFFECTIVE_FROM_MS),
    ).toBeNull();
    expect(
      validationFeeActivationError(
        NOTICE_PUBLISHED_AT_MS + 1,
        EFFECTIVE_FROM_MS,
      ),
    ).toMatch(/thirty calendar days/);
    expect(
      validationFeeActivationError(
        NOTICE_PUBLISHED_AT_MS,
        EFFECTIVE_FROM_MS + 3_600_000,
      ),
    ).toMatch(/Honiara month start/);
    expect(() =>
      normalizeValidationFeePolicy(
        policy({ notice_published_at_ms: NOTICE_PUBLISHED_AT_MS + 1 }),
      ),
    ).toThrow(/thirty calendar days/);
    // Native `notice_published_at_ms` is a plain u64: zero is admissible.
    expect(validationFeeActivationError(0, EFFECTIVE_FROM_MS)).toBeNull();
    expect(validationFeeActivationError(-1, EFFECTIVE_FROM_MS)).toMatch(
      /thirty calendar days/,
    );
    expect(
      normalizeValidationFeePolicy(policy({ notice_published_at_ms: 0 }))
        .notice_published_at_ms,
    ).toBe(0);
    expect(() =>
      normalizeValidationFeePolicy(policy({ notice_published_at_ms: -1 })),
    ).toThrow(/JSON integer/);
    expect(EFFECTIVE_FROM_MS - NOTICE_PUBLISHED_AT_MS).toBe(
      VALIDATION_FEE_NOTICE_MS,
    );
    expect(honiaraMonthStartsFrom(EFFECTIVE_FROM_MS, 2)).toEqual([
      EFFECTIVE_FROM_MS,
      NEXT_MONTH_START_MS,
    ]);
    expect(honiaraMonthStartsFrom(EFFECTIVE_FROM_MS + 1, 1)).toEqual([
      NEXT_MONTH_START_MS,
    ]);
    expect(
      honiaraMonthStartsFrom(Date.UTC(2026, 11, 15), 2).map(
        formatHoniaraTimestamp,
      ),
    ).toEqual(["2027-01-01 00:00", "2027-02-01 00:00"]);
    expect(formatHoniaraTimestamp(EFFECTIVE_FROM_MS)).toBe("2026-11-01 00:00");
  });

  it("keeps activations inside the native year-9999 calendar domain", () => {
    // Native `honiara_month_bounds` (Rust `time`, no `large-dates`) accepts
    // Honiara 9999-11-01, rejects 9999-12-01, and panics for Honiara year
    // 10000; the wallet must stop at the last evaluable month start.
    const honiara = (year: number, month: number) =>
      Date.UTC(year, month, 1) - 11 * 3_600_000;
    expect(HONIARA_LAST_NATIVE_MONTH_START_MS).toBe(honiara(9999, 10));
    expect(formatHoniaraTimestamp(HONIARA_LAST_NATIVE_MONTH_START_MS)).toBe(
      "9999-11-01 00:00",
    );
    const accepted = honiara(9999, 10);
    expect(
      validationFeeActivationError(
        accepted - VALIDATION_FEE_NOTICE_MS,
        accepted,
      ),
    ).toBeNull();
    expect(
      normalizeValidationFeePolicy(
        policy({
          effective_from_ms: accepted,
          notice_published_at_ms: accepted - VALIDATION_FEE_NOTICE_MS,
        }),
      ).effective_from_ms,
    ).toBe(accepted);
    for (const effective of [
      honiara(9999, 11),
      // Honiara 10000-01-01: the instant that aborted the native process.
      253_402_261_200_000,
      honiara(200_000, 0),
    ]) {
      expect(
        validationFeeActivationError(
          effective - VALIDATION_FEE_NOTICE_MS,
          effective,
        ),
      ).toMatch(/last month the native calendar can evaluate/);
      expect(() =>
        normalizeValidationFeePolicy(
          policy({
            effective_from_ms: effective,
            notice_published_at_ms: effective - VALIDATION_FEE_NOTICE_MS,
          }),
        ),
      ).toThrow(/last month the native calendar can evaluate/);
    }
    expect(honiaraMonthStartsFrom(honiara(9999, 9), 5)).toEqual([
      honiara(9999, 9),
      honiara(9999, 10),
    ]);
    expect(honiaraMonthStartsFrom(honiara(9999, 10) + 1, 3)).toEqual([]);
    // Beyond the JavaScript Date range this used to loop forever.
    expect(honiaraMonthStartsFrom(Number.MAX_SAFE_INTEGER, 3)).toEqual([]);
  });

  it("checks the ledger enactment window against the current clock", () => {
    const now = NOTICE_PUBLISHED_AT_MS;
    const draft = {
      notice_published_at_ms: now,
      effective_from_ms: EFFECTIVE_FROM_MS,
    };
    expect(validationFeeEnactmentWindowError(draft, now)).toBeNull();
    expect(validationFeeEnactmentWindowError(draft, now + 1)).toMatch(
      /thirty days from now/,
    );
    expect(
      validationFeeEnactmentWindowError(
        { ...draft, notice_published_at_ms: now + 1 },
        now,
      ),
    ).toMatch(/must not postdate this proposal/);
    expect(validationFeeEnactmentWindowError(draft, Number.NaN)).toMatch(
      /current time is unavailable/,
    );
  });

  it("enforces the native payout binding invariants", () => {
    const rejects = (overrides: Record<string, unknown>, pattern: RegExp) =>
      expect(() =>
        normalizeValidationFeePayoutBinding(payoutBinding(overrides)),
      ).toThrow(pattern);
    const providers = [...REFERENCE_PROVIDER_ACCOUNT_IDS];
    rejects({ code_hash: "ab".repeat(32) }, /uppercase hexadecimal/);
    rejects({ code_hash: `0x${"34".repeat(32)}` }, /uppercase hexadecimal/);
    rejects({ pool_code_hash: "00".repeat(32) }, /non-zero/);
    rejects({ entrypoint: "tick" }, /autonomous_validation_fee_tick/);
    rejects({ reference_feed_id: "xor_per_sbd" }, /one-element FeedId/);
    // Native `Name`: at most 255 UTF-8 bytes, no white space, control,
    // bidirectional-control, or reserved characters, and exact NFC.
    for (const feed of ["a".repeat(255), "\u00e9".repeat(127), "xor/sbd"]) {
      expect(
        normalizeValidationFeePayoutBinding(
          payoutBinding({ reference_feed_id: [feed] }),
        ).reference_feed_id,
      ).toEqual([feed]);
    }
    for (const feed of [
      "",
      "a".repeat(256),
      "\u00e9".repeat(128),
      "xor per sbd",
      "xor\u00a0sbd",
      "xor\u0007sbd",
      "xor\u200esbd",
      "xor#sbd",
      "xor@sbd",
      "xor$sbd",
      "e\u0301",
    ]) {
      rejects({ reference_feed_id: [feed] }, /canonical Iroha name/);
    }
    rejects(
      { reference_provider_accounts: providers.slice(0, 4) },
      /exactly 5/,
    );
    rejects(
      { reference_provider_accounts: [...providers.slice(0, 4), providers[0]] },
      /distinct/,
    );
    rejects(
      { pool_vault_account_id: TREASURY_ACCOUNT_ID },
      /pairwise distinct/,
    );
    rejects(
      { reward_pool_account_id: TREASURY_ACCOUNT_ID },
      /pairwise distinct/,
    );
    rejects({ xor_asset_id: "7ZepsJTHCVLKsrFFNZGSRGZgvBhv" }, /must differ/);
    rejects({ max_sbd_per_day_minor: 999 }, /at least/);
    rejects({ max_slippage_bps: 10_000 }, /below 10000/);
    rejects({ min_interval_ms: 0 }, /positive/);
    rejects({ reference_feed_config_version: 0 }, /positive/);
    rejects({ max_source_age_ms: "300000" }, /JSON integer/);
    rejects({ min_reward_claim_xor_minor: 0 }, /positive/);
    rejects({ contract_address: "tairac1qyqq" }, /irohac1 contract address/);
  });

  it("normalizes only the exact typed list envelope and native IDs", () => {
    const normalized = normalizeGovernanceProposalList(
      {
        version: 1,
        limit: 2,
        proposals: [
          proposal(lifecycleKind()),
          proposal(policyKind(), { created_height: 101 }),
        ],
        next_cursor: `${Buffer.from("vfprop01").toString("hex")}${"0".repeat(80)}`,
      },
      resolver,
    );
    expect(normalized.items.map(({ proposalId }) => proposalId)).toEqual([
      `0x${id("1")}`,
      `0x${id("2")}`,
    ]);
    expect(normalized.limit).toBe(2);

    // A ledger-admissible zero-notice policy must not blank the whole page.
    const zeroNoticePolicyKind = {
      ...policyKind(),
      payload: {
        ...policyKind().payload,
        policy: policy({ notice_published_at_ms: 0 }),
      },
    };
    expect(
      normalizeGovernanceProposalList(
        {
          version: 1,
          limit: 2,
          proposals: [
            proposal(lifecycleKind()),
            proposal(zeroNoticePolicyKind, { created_height: 101 }),
          ],
          next_cursor: null,
        },
        resolver,
      ).items,
    ).toHaveLength(2);

    // An activation outside the native calendar fails closed before the
    // native fingerprint, which would otherwise abort the renderer process.
    const nativeResolver = vi.fn(resolver);
    const beyondCalendar = 253_402_261_200_000;
    expect(() =>
      normalizeGovernanceProposalList(
        {
          version: 1,
          limit: 1,
          proposals: [
            proposal({
              ...policyKind(),
              payload: {
                ...policyKind().payload,
                policy: policy({
                  effective_from_ms: beyondCalendar,
                  notice_published_at_ms:
                    beyondCalendar - VALIDATION_FEE_NOTICE_MS,
                }),
              },
            }),
          ],
          next_cursor: null,
        },
        nativeResolver,
      ),
    ).toThrow(/last month the native calendar can evaluate/);
    expect(nativeResolver).not.toHaveBeenCalled();

    expect(() =>
      normalizeGovernanceProposalList(
        {
          version: 1,
          limit: 1,
          proposals: [{ ...proposal(lifecycleKind()), proposal_id: id("1") }],
          next_cursor: null,
        },
        resolver,
      ),
    ).toThrow(/exactly/);
    expect(() =>
      normalizeGovernanceProposalList(
        {
          version: 1,
          limit: 2,
          proposals: [
            proposal(policyKind(), { created_height: 101 }),
            proposal(lifecycleKind()),
          ],
          next_cursor: null,
        },
        resolver,
      ),
    ).toThrow(/ordered/);
  });

  it("fails closed on certificates until the public SDK exports its exact validator", () => {
    const proposalId = `0x${id("1")}`;
    expect(() =>
      normalizeGovernanceProposalDetail(
        {
          version: 1,
          proposal: proposal(lifecycleKind(), { status: "Enacted" }),
          current_height: "800",
          governance_certificate: {
            proposal_content_id: id("1"),
          },
        },
        proposalId,
        resolver,
      ),
    ).toThrow(/public Iroha SDK exports its exact GovernanceCertificateV1/u);

    expect(() =>
      normalizeGovernanceProposalDetail(
        {
          version: 1,
          proposal: proposal(lifecycleKind()),
          current_height: "120",
          governance_certificate: null,
        },
        `0x${id("2")}`,
        resolver,
      ),
    ).toThrow(/requested native fingerprint/);
  });

  it("validates the next contiguous revision against the verified registry head", () => {
    const context = {
      effective: normalizeValidationFeePolicy(policy()),
      registryHead: { policyHash: HEAD_HASH, policyVersion: "1" },
    };
    const extendError =
      "Validation-fee policy must extend the verified registry head with the next version and its policy hash.";
    expect(canonicalGovernanceProposalId(id("a"))).toBe(`0x${id("a")}`);
    expect(canonicalGovernanceProposalId(id("A"))).toBeNull();
    expect(validateValidationFeePolicy(nextRevision(), context)).toEqual([]);
    expect(validateValidationFeePolicy(nextRevision(), null)).toEqual([
      "Validation-fee policy proposals require locally verified consensus proof state.",
    ]);
    expect(
      validateValidationFeePolicy(nextRevision(), {
        ...context,
        registryHead: { ...context.registryHead, policyVersion: null },
      }),
    ).toEqual([
      "A scheduled validation-fee revision is pending; wait until it becomes effective before proposing another revision.",
    ]);
    expect(
      validateValidationFeePolicy(
        nextRevision({ policy_version: "3" }),
        context,
      ),
    ).toContain(extendError);
    expect(
      validateValidationFeePolicy(
        nextRevision({ previous_policy_hash: "CD".repeat(32) }),
        context,
      ),
    ).toContain(extendError);
    expect(
      validateValidationFeePolicy(
        nextRevision({
          effective_from_ms: EFFECTIVE_FROM_MS,
          notice_published_at_ms: NOTICE_PUBLISHED_AT_MS,
        }),
        context,
      ),
    ).toContain(
      "Validation-fee activation must advance beyond the effective policy.",
    );
    expect(
      validateValidationFeePolicy(
        nextRevision({
          reward_custody: { ...rewardCustody(), validator_lane_id: 1 },
        }),
        context,
      ),
    ).toContain(
      "Validation-fee network, treasury, and reward custody are immutable across revisions.",
    );
    expect(
      validateValidationFeePolicy(
        { ...nextRevision(), fee: "0.10" },
        context,
      )[0],
    ).toMatch(/no trailing zeros/);
    expect(
      validateValidationFeePolicy(
        nextRevision({ notice_published_at_ms: 0 }),
        context,
      ),
    ).toEqual(["Validation-fee notice must be a published timestamp."]);
    // With the wallet clock, a draft whose activation now falls inside the
    // thirty-day enactment window is reported instead of failing on prepare.
    expect(
      validateValidationFeePolicy(nextRevision(), context, {
        nowMs: EFFECTIVE_FROM_MS,
      }),
    ).toEqual([]);
    expect(
      validateValidationFeePolicy(nextRevision(), context, {
        nowMs: EFFECTIVE_FROM_MS + 20 * 86_400_000,
      }),
    ).toEqual([
      "The activation month must start at least thirty days from now, because Parliament cannot enact this proposal earlier; choose a later month.",
    ]);
  });

  it("drafts the next contiguous revision from the verified policy view", () => {
    const effective = normalizeValidationFeePolicy(policy());
    const view = {
      observedHeight: "130000",
      observedAtMs: EFFECTIVE_FROM_MS + 1,
      effective,
      effectivePolicyHash: HEAD_HASH,
      registryHead: { policyHash: HEAD_HASH, policyVersion: "1" },
      verifiedProof: {
        schema: "cbsi.validation-fee-ledger-projection.v1" as const,
        authorizationModel: "SORA_PARLIAMENT_V1" as const,
        registrySnapshotHash: id("3"),
        finalizedBlockHash: id("4"),
        finalizedContextId: id("5"),
        trustedCheckpointHeight: "129000",
        trustedCheckpointContextId: id("6"),
      },
    };
    const draft = draftNextValidationFeePolicy(view, {
      networkId: TAIRA_NETWORK_ID,
      noticePublishedAtMs: EFFECTIVE_FROM_MS,
    });
    expect(draft).toEqual(nextRevision());
    expect(Object.keys(draft)).toEqual(Object.keys(policy()));
    expect(
      validateValidationFeePolicy(draft, {
        effective,
        registryHead: view.registryHead,
      }),
    ).toEqual([]);
    draft.retail_schedule.maintenance_tiers[0].monthly_fee_minor = 1;
    draft.reward_custody.validator_lane_id = 9;
    expect(
      effective.retail_schedule.maintenance_tiers[0].monthly_fee_minor,
    ).toBe(100);
    expect(effective.reward_custody.validator_lane_id).toBe(0);

    const pending = draftNextValidationFeePolicy(
      { ...view, registryHead: { policyHash: id("7"), policyVersion: null } },
      { networkId: TAIRA_NETWORK_ID, noticePublishedAtMs: EFFECTIVE_FROM_MS },
    );
    expect(pending.policy_version).toBe("");
    expect(pending.previous_policy_hash).toBe(id("7"));
  });

  it("offers only Honiara activation months that respect notice and ordering", () => {
    expect(
      earliestValidationFeeActivationMs(
        NOTICE_PUBLISHED_AT_MS,
        NOTICE_PUBLISHED_AT_MS,
      ),
    ).toBe(EFFECTIVE_FROM_MS);
    expect(
      earliestValidationFeeActivationMs(
        NOTICE_PUBLISHED_AT_MS,
        EFFECTIVE_FROM_MS,
      ),
    ).toBe(EFFECTIVE_FROM_MS + 1);
    expect(
      validationFeeActivationChoices(
        NOTICE_PUBLISHED_AT_MS,
        NOTICE_PUBLISHED_AT_MS,
        2,
      ),
    ).toEqual([EFFECTIVE_FROM_MS, NEXT_MONTH_START_MS]);
    expect(
      validationFeeActivationChoices(
        NOTICE_PUBLISHED_AT_MS,
        EFFECTIVE_FROM_MS,
        1,
      ),
    ).toEqual([NEXT_MONTH_START_MS]);
    expect(validationFeeActivationChoices(0, EFFECTIVE_FROM_MS, 3)).toEqual([]);
    for (const choice of validationFeeActivationChoices(
      NOTICE_PUBLISHED_AT_MS + 123,
      EFFECTIVE_FROM_MS,
      12,
    )) {
      expect(
        validationFeeActivationError(NOTICE_PUBLISHED_AT_MS + 123, choice),
      ).toBeNull();
    }
  });

  it("adds and removes maintenance tiers within the native bounds", () => {
    const base = tiers([0, 100], [500, 200]);
    expect(appendRetailMaintenanceTier(base)).toEqual(
      tiers([0, 100], [500, 200], [501, 200]),
    );
    expect(appendRetailMaintenanceTier([])).toEqual(tiers([1, 1]));
    const full = tiers(
      ...Array.from({ length: 32 }, (_, index): [number, number] => [index, 1]),
    );
    expect(appendRetailMaintenanceTier(full)).toBe(full);
    expect(removeRetailMaintenanceTier(base, 1)).toEqual(tiers([0, 100]));
    expect(removeRetailMaintenanceTier(base, 0)).toBe(base);
    expect(removeRetailMaintenanceTier(base, 5)).toBe(base);
    expect(removeRetailMaintenanceTier(tiers([0, 100]), 0)).toEqual(
      tiers([0, 100]),
    );
  });
});
