import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { isProxy } from "vue";
import GovernanceComposer from "@/components/governance/GovernanceComposer.vue";
import {
  normalizeValidationFeePolicy,
  type GovernanceValidationFeePolicyView,
  type ValidationFeePolicyPayload,
} from "@/governance/model";
import * as services from "@/services/iroha";
import { useEndpointStore } from "@/stores/endpoint";
import {
  useParliamentStore,
  VALIDATION_FEE_COMPOSER_CLOCK_INTERVAL_MS,
} from "@/stores/parliament";
import { useSessionStore } from "@/stores/session";
import {
  TAIRA_CHAIN_ID,
  TAIRA_TORII_URL,
} from "@/utils/firstReleaseNetworkIdentity";
import { TEST_TAIRA_NETWORK_ID } from "./helpers/networkIdentityFixture";
import {
  EFFECTIVE_FROM_MS,
  NEXT_MONTH_START_MS,
  PROPOSAL_OPERATOR,
  validationFeePolicy,
} from "./helpers/validationFeeFixtures";

vi.mock("@/services/iroha", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/iroha")>()),
  confirmGovernanceAction: vi.fn(),
  fetchAccountAssets: vi.fn(),
  getGovernanceCapabilities: vi.fn(),
  getGovernanceCitizenCount: vi.fn(),
  getGovernanceCitizenStatus: vi.fn(),
  getGovernanceCouncilCurrent: vi.fn(),
  getGovernanceCurrentValidationFeePolicy: vi.fn(),
  getGovernanceProposalDetail: vi.fn(),
  getGovernanceUnlockStats: vi.fn(),
  listGovernanceProposals: vi.fn(),
  prepareGovernanceCitizenRegistration: vi.fn(),
  prepareGovernanceProposal: vi.fn(),
}));

const DAY_MS = 86_400_000;
/** 2026-10-13 14:00 Honiara (UTC+11): the draft is seeded at this instant. */
const SEEDED_AT_MS = Date.UTC(2026, 9, 13, 3, 0);
/** 2027-01-01 00:00 Honiara. */
const JANUARY_2027_MS = Date.UTC(2027, 0, 1) - 11 * 3_600_000;
const HEAD_HASH = `${"ab".repeat(31)}ad`;
const ACTIVATION_ERROR =
  "Validation-fee activation must be a Honiara month start at least thirty calendar days after the public notice.";

const effective = normalizeValidationFeePolicy(validationFeePolicy());

const policyView = (): GovernanceValidationFeePolicyView => ({
  observedHeight: "130000",
  observedAtMs: EFFECTIVE_FROM_MS + DAY_MS,
  effective: structuredClone(effective),
  effectivePolicyHash: HEAD_HASH,
  registryHead: { policyHash: HEAD_HASH, policyVersion: "1" },
  verifiedProof: {
    schema: "cbsi.validation-fee-ledger-projection.v1",
    authorizationModel: "SORA_PARLIAMENT_V1",
    registrySnapshotHash: "3".repeat(64),
    finalizedBlockHash: "4".repeat(64),
    finalizedContextId: "5".repeat(64),
    trustedCheckpointHeight: "129000",
    trustedCheckpointContextId: "6".repeat(64),
  },
});

const capabilities = () => ({
  schema: "iroha.governance.capabilities.v1",
  version: 1,
  networkId: TEST_TAIRA_NETWORK_ID,
  currentHeight: "130000",
  networkPrefix: 369,
  mandatoryPrivateBallots: true,
  proposalBackedReferendumBallotsSupported: false,
  supportedProposalKinds: ["VALIDATION_FEE_POLICY"],
  citizenshipAssetId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
  citizenshipBondAmount: "10000",
});

const mocked = <T extends (...args: never[]) => unknown>(value: T) =>
  vi.mocked(value);

const setUpStores = () => {
  const pinia = createPinia();
  setActivePinia(pinia);
  useSessionStore().$patch({
    connection: {
      toriiUrl: TAIRA_TORII_URL,
      chainId: TAIRA_CHAIN_ID,
      assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      networkPrefix: 369,
    },
    accounts: [
      {
        displayName: "Operator",
        domain: "wonderland",
        accountId: PROPOSAL_OPERATOR,
        publicKeyHex: "07".repeat(32),
        hasStoredSecret: true,
      },
    ],
    activeAccountId: PROPOSAL_OPERATOR,
  } as never);
  useEndpointStore().$patch({
    state: "ready",
    inspection: {
      schema: "iroha.wallet.endpoint-inspection.v1",
      toriiUrl: TAIRA_TORII_URL,
      expected: { chainId: TAIRA_CHAIN_ID, networkPrefix: 369 },
      observed: {
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: 369,
        networkId: TEST_TAIRA_NETWORK_ID,
      },
      networkIdentity: { pinned: { networkId: TEST_TAIRA_NETWORK_ID } },
      identityStatus: "matched",
      accessMode: "read-write",
      checkedAtMs: 1,
      evidence: [],
      diagnostic: {
        code: "endpoint_identity_matched",
        message: "Endpoint identity matched.",
      },
      features: {
        governanceWrites: {
          supported: true,
          source: "openapi",
          requiredOperations: [],
          missingOperations: [],
        },
      },
    },
  } as never);
  return pinia;
};

const bootstrapStore = async () => {
  const governance = useParliamentStore();
  await governance.bootstrap();
  await flushPromises();
  return governance;
};

const mountComposer = (pinia: ReturnType<typeof createPinia>) =>
  mount(GovernanceComposer, {
    global: { plugins: [pinia], stubs: { teleport: true } },
  });

const buttonByText = (wrapper: VueWrapper, text: string) => {
  const button = wrapper
    .findAll("button")
    .find((candidate) => candidate.text().trim() === text);
  if (!button) throw new Error(`No button labelled ${text}`);
  return button;
};

describe("validation-fee composer and parliament store wiring", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        "Date",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
    vi.setSystemTime(SEEDED_AT_MS);
    mocked(services.getGovernanceCapabilities).mockResolvedValue(
      capabilities() as never,
    );
    mocked(services.getGovernanceCitizenStatus).mockResolvedValue({
      state: "citizen",
    } as never);
    mocked(services.getGovernanceCitizenCount).mockResolvedValue({
      count: 1,
    } as never);
    mocked(services.getGovernanceCouncilCurrent).mockResolvedValue({
      members: [],
    } as never);
    mocked(services.getGovernanceUnlockStats).mockResolvedValue({} as never);
    mocked(services.getGovernanceCurrentValidationFeePolicy).mockImplementation(
      async () => policyView(),
    );
    mocked(services.listGovernanceProposals).mockResolvedValue({
      items: [],
      nextCursor: null,
      limit: 30,
    } as never);
    mocked(services.fetchAccountAssets).mockResolvedValue({
      items: [],
      total: 0,
    } as never);
    mocked(services.prepareGovernanceProposal).mockResolvedValue({
      reviewId: "review-1",
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    document.body.replaceChildren();
  });

  it("seeds the next revision from the verified view and renders it", async () => {
    const pinia = setUpStores();
    const governance = await bootstrapStore();

    const draft = governance.validationFeeComposer;
    expect(draft.policy_version).toBe("2");
    expect(draft.previous_policy_hash).toBe(HEAD_HASH.toUpperCase());
    expect(draft.network_id).toBe(TEST_TAIRA_NETWORK_ID);
    expect(draft.notice_published_at_ms).toBe(SEEDED_AT_MS);
    // 2026-10-13 14:00 + 30 days falls in November, so December is first.
    expect(draft.effective_from_ms).toBe(NEXT_MONTH_START_MS);
    expect(draft.reward_custody).toEqual(effective.reward_custody);
    expect(governance.validationFeeActivationChoices).toHaveLength(12);
    expect(governance.validationFeeActivationChoices[0]).toBe(
      NEXT_MONTH_START_MS,
    );
    expect(governance.validationFeeComposerErrors).toEqual([]);

    governance.openComposer();
    const wrapper = mountComposer(pinia);
    await flushPromises();
    const text = wrapper.text();
    expect(text).toContain("Institutional payment fee (SBD)");
    expect(text).toContain(
      "Charged on each qualifying institutional transfer, separately from the retail monthly allowance.",
    );
    expect(
      wrapper
        .findAll("input")
        .map((input) => (input.element as HTMLInputElement).value),
    ).toContain("2026-10-13 14:00 Honiara time");
    expect(wrapper.findAll("select option")).toHaveLength(12);
    expect(wrapper.find("select").element.value).toBe(
      String(NEXT_MONTH_START_MS),
    );
    expect(wrapper.find(".validation-errors").exists()).toBe(false);
    expect(
      buttonByText(wrapper, "Decode and quote").attributes("disabled"),
    ).toBeUndefined();
    wrapper.unmount();
  });

  it("edits tiers, fee and activation through the form and prepares a plain {policy} copy", async () => {
    const pinia = setUpStores();
    const governance = await bootstrapStore();
    governance.openComposer();
    const wrapper = mountComposer(pinia);
    await flushPromises();

    await buttonByText(wrapper, "Add tier").trigger("click");
    expect(
      governance.validationFeeComposer.retail_schedule.maintenance_tiers,
    ).toHaveLength(6);
    expect(
      governance.validationFeeComposer.retail_schedule.maintenance_tiers[5],
    ).toEqual({
      minimum_average_balance_minor: 5_000_001,
      monthly_fee_minor: 1_000,
    });
    const removeButtons = wrapper
      .findAll("button")
      .filter((candidate) => candidate.text().trim() === "Remove tier");
    expect(removeButtons).toHaveLength(6);
    expect(removeButtons[0].attributes("disabled")).toBeDefined();
    await removeButtons[5].trigger("click");
    expect(
      governance.validationFeeComposer.retail_schedule.maintenance_tiers,
    ).toEqual(effective.retail_schedule.maintenance_tiers);

    const secondChoice = governance.validationFeeActivationChoices[1];
    expect(secondChoice).toBe(JANUARY_2027_MS);
    await wrapper.find("select").setValue(String(secondChoice));
    expect(governance.validationFeeComposer.effective_from_ms).toBe(
      secondChoice,
    );
    const feeInput = wrapper.find('input[inputmode="decimal"]');
    await feeInput.setValue("0.25");
    expect(governance.validationFeeComposer.fee).toBe("0.25");
    await feeInput.setValue("0.10");
    await flushPromises();
    expect(wrapper.find(".validation-errors").text()).toMatch(
      /no trailing zeros/,
    );
    expect(
      buttonByText(wrapper, "Decode and quote").attributes("disabled"),
    ).toBeDefined();
    await feeInput.setValue("0.25");
    await flushPromises();

    vi.setSystemTime(SEEDED_AT_MS + 5 * 60_000);
    await buttonByText(wrapper, "Decode and quote").trigger("click");
    await flushPromises();

    const prepare = mocked(services.prepareGovernanceProposal);
    expect(prepare).toHaveBeenCalledTimes(1);
    const input = prepare.mock.calls[0][0] as unknown as {
      kind: string;
      payload: { policy: ValidationFeePolicyPayload };
    };
    expect(input).toMatchObject({
      toriiUrl: TAIRA_TORII_URL,
      chainId: TAIRA_CHAIN_ID,
      accountId: PROPOSAL_OPERATOR,
      networkPrefix: 369,
      kind: "ValidationFeePolicy",
    });
    expect(Object.keys(input.payload)).toEqual(["policy"]);
    const policy = input.payload.policy;
    expect(isProxy(policy)).toBe(false);
    expect(isProxy(policy.retail_schedule.maintenance_tiers)).toBe(false);
    expect(normalizeValidationFeePolicy(policy)).toEqual(policy);
    expect(policy).toMatchObject({
      policy_version: "2",
      previous_policy_hash: HEAD_HASH.toUpperCase(),
      fee: "0.25",
      effective_from_ms: JANUARY_2027_MS,
      // The proposal is its own notice: stamped when it is prepared.
      notice_published_at_ms: SEEDED_AT_MS + 5 * 60_000,
      charging_mode: { charging_mode: "RETAIL_MONTHLY_ALLOWANCE", value: null },
      exemption_classes: ["TREASURY_PAYOUT"],
    });
    expect(governance.review).toEqual({ reviewId: "review-1" });
    expect(governance.actionError).toBe("");
    wrapper.unmount();
  });

  it("reports an activation that the clock has overtaken and blocks Decode and quote", async () => {
    const pinia = setUpStores();
    const governance = await bootstrapStore();
    governance.openComposer();
    const wrapper = mountComposer(pinia);
    await flushPromises();
    expect(governance.validationFeeComposerErrors).toEqual([]);

    // Twenty days later the seeded December activation is inside the
    // thirty-day window: the open composer's clock tick reports it.
    vi.setSystemTime(SEEDED_AT_MS + 20 * DAY_MS);
    vi.advanceTimersByTime(VALIDATION_FEE_COMPOSER_CLOCK_INTERVAL_MS);
    const staleNow =
      SEEDED_AT_MS + 20 * DAY_MS + VALIDATION_FEE_COMPOSER_CLOCK_INTERVAL_MS;
    expect(governance.validationFeeComposer.notice_published_at_ms).toBe(
      staleNow,
    );
    await flushPromises();
    expect(governance.validationFeeComposer.effective_from_ms).toBe(
      NEXT_MONTH_START_MS,
    );
    expect(governance.validationFeeComposerErrors).toEqual([ACTIVATION_ERROR]);
    expect(wrapper.find(".validation-errors").text()).toContain(
      ACTIVATION_ERROR,
    );
    expect(
      buttonByText(wrapper, "Decode and quote").attributes("disabled"),
    ).toBeDefined();
    expect(governance.validationFeeActivationChoices[0]).toBe(JANUARY_2027_MS);

    await governance.prepareProposal();
    expect(services.prepareGovernanceProposal).not.toHaveBeenCalled();
    expect(governance.actionError).toBe(ACTIVATION_ERROR);

    // Reopening re-drafts the time fields: the stale month moves to the
    // earliest valid one and the draft becomes preparable again.
    governance.closeComposer();
    governance.openComposer();
    await flushPromises();
    expect(governance.validationFeeComposer.notice_published_at_ms).toBe(
      staleNow,
    );
    expect(governance.validationFeeComposer.effective_from_ms).toBe(
      JANUARY_2027_MS,
    );
    expect(governance.validationFeeComposerErrors).toEqual([]);
    wrapper.unmount();
  });

  it("keeps edits across same-head refreshes and stops the clock when closed", async () => {
    setUpStores();
    const governance = await bootstrapStore();
    governance.validationFeeComposer.fee = "0.3";
    governance.openComposer();

    await governance.refresh();
    await flushPromises();
    expect(governance.validationFeeComposer.fee).toBe("0.3");
    expect(governance.validationFeeComposer.policy_version).toBe("2");

    governance.closeComposer();
    await flushPromises();
    vi.setSystemTime(SEEDED_AT_MS + 20 * DAY_MS);
    vi.advanceTimersByTime(VALIDATION_FEE_COMPOSER_CLOCK_INTERVAL_MS * 3);
    expect(governance.validationFeeComposer.notice_published_at_ms).toBe(
      SEEDED_AT_MS,
    );

    mocked(services.getGovernanceCurrentValidationFeePolicy).mockResolvedValue({
      ...policyView(),
      effectivePolicyHash: `${"cd".repeat(31)}cf`,
      registryHead: { policyHash: `${"cd".repeat(31)}cf`, policyVersion: "2" },
      effective: normalizeValidationFeePolicy(
        validationFeePolicy({
          policy_version: "2",
          previous_policy_hash: HEAD_HASH.toUpperCase(),
          effective_from_ms: NEXT_MONTH_START_MS,
          notice_published_at_ms: EFFECTIVE_FROM_MS,
        }),
      ),
    });
    await governance.refresh();
    await flushPromises();
    expect(governance.validationFeeComposer.fee).toBe("0.1");
    expect(governance.validationFeeComposer.policy_version).toBe("3");
    expect(governance.validationFeeComposer.notice_published_at_ms).toBe(
      SEEDED_AT_MS +
        20 * DAY_MS +
        VALIDATION_FEE_COMPOSER_CLOCK_INTERVAL_MS * 3,
    );
  });
});
