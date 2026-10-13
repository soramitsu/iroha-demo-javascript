import { TEST_TAIRA_NETWORK_ID } from "./networkIdentityFixture";

/**
 * TAIRA (prefix 369) renderings of the reviewed SDK native structural
 * fixtures (`retail_fee_native_policy_v1.json` /
 * `retail_fee_native_conversion_v1.json`), with the TAIRA SBD asset.
 *
 * The treasury is the subject account of `CONTRACT_ADDRESS`, and the pool
 * vault is the subject account of `POOL_CONTRACT_ADDRESS`, as the native
 * binding invariants require.
 */
export const SBD_ASSET_ID = "7ZepsJTHCVLKsrFFNZGSRGZgvBhv";
export const XOR_ASSET_ID = "5dHF5UNffENuEg9mhjYwY1jcZ1K5";
export const CONTRACT_ADDRESS =
  "irohac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9gg4yxgjw";
export const POOL_CONTRACT_ADDRESS =
  "irohac1qyqqqqqqqqqqqqqlzk3skqs8v0haerev9p09yp3ml26zrnctdwz5u";
export const TREASURY_ACCOUNT_ID =
  "testuﾛ1PZﾗidｱJJHofｸXNｵｿcﾐﾃgﾀﾔzBYﾜcﾈｦfｶxKfﾁｼ1pG871VMK";
export const REWARD_POOL_ACCOUNT_ID =
  "testuﾛ1Q2ﾜﾓ4bｳEDHﾏﾇｿSyFﾘk6bX74ﾙｦRﾙﾄM2GｻSｳｴpPヰｱ6HEY4T";
export const POOL_VAULT_ACCOUNT_ID =
  "testuﾛ1NﾔBnヱ5ﾈﾘｦﾇｦTｻﾂVUﾓヱｺYﾏ3bｲ1ｻaﾌTtﾎﾉtｹZｱﾜo4VHCA4Q";
export const REFERENCE_PROVIDER_ACCOUNT_IDS = [
  "testuﾛ1NﾛfﾋﾅｴﾋｦpF6ﾃnｹ12YﾎﾓhEnﾉﾊzﾇDna3ﾘﾌﾓvyyfzﾈJNNQCB",
  "testuﾛ1PｹｵvｴｦsBBSi4ｴV8hKﾂﾐssqｦｸ5HsﾈetyﾑGｻﾐ894zJG3P54",
  "testuﾛ1NｷwkVｵﾄｼｻAm42LAﾎ6ﾘGpﾋヱ5ﾏｵﾁﾘﾓmKTヰﾃヰcｽFZcB7JLP1",
  "testuﾛ1NﾖWﾚﾉﾋﾐﾂﾉﾉoPMRgｷ5s1ﾀfｲs8ﾀPrｽDｱ7nﾑJヱﾌﾍCLK95DJD",
  "testuﾛ1NﾒEﾜM3ﾏHkhDﾎヰﾀsY4sｼCｹﾌ6ｼvNSﾖｽﾁｼ22ｦSヰyﾐﾜPQR463",
] as const;
/** Ed25519 seed-7 and seed-8 accounts (the Rust test proposal operators). */
export const PROPOSAL_OPERATOR =
  "testuﾛ1Pｽp8zXFQﾗｷPsFﾒｶﾑ3ｵmﾉbｼｽUｱｶヱﾚBXヱﾊCﾋﾘﾈvuKFKM346";
export const SECOND_PROPOSAL_OPERATOR =
  "testuﾛ1NrﾑﾛﾔﾎRﾓMNｹEﾔﾙﾗdｶrﾎuﾑﾚcﾔKfﾆyﾓｸjVﾌTﾙﾖｾﾋｷGK5P4K";

/** 2026-10-02 00:00 Honiara: notice exactly thirty days before activation. */
export const NOTICE_PUBLISHED_AT_MS = 1_790_859_600_000;
/** 2026-11-01 00:00 Honiara (UTC+11). */
export const EFFECTIVE_FROM_MS = 1_793_451_600_000;
/** 2026-12-01 00:00 Honiara (UTC+11). */
export const NEXT_MONTH_START_MS = 1_796_043_600_000;

export const retailSchedule = () => ({
  included_payments: 50,
  overage_minor: 10,
  maintenance_tiers: [
    { minimum_average_balance_minor: 0, monthly_fee_minor: 100 },
    { minimum_average_balance_minor: 50_000, monthly_fee_minor: 200 },
    { minimum_average_balance_minor: 250_000, monthly_fee_minor: 300 },
    { minimum_average_balance_minor: 1_000_000, monthly_fee_minor: 500 },
    { minimum_average_balance_minor: 5_000_000, monthly_fee_minor: 1_000 },
  ],
});

export const rewardCustody = () => ({
  contract_address: CONTRACT_ADDRESS,
  treasury_account_id: TREASURY_ACCOUNT_ID,
  ds_asset_id: SBD_ASSET_ID,
  xor_asset_id: XOR_ASSET_ID,
  reward_pool_account_id: REWARD_POOL_ACCOUNT_ID,
  validator_lane_id: 0,
});

/** Native `ValidationFeePolicyV1` in exact field order. */
export const validationFeePolicy = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  schema_version: 1,
  network_id: TEST_TAIRA_NETWORK_ID,
  policy_version: "1",
  previous_policy_hash: null,
  ds_asset_id: SBD_ASSET_ID,
  ds_scale: 2,
  retail_schedule: retailSchedule(),
  effective_from_ms: EFFECTIVE_FROM_MS,
  notice_published_at_ms: NOTICE_PUBLISHED_AT_MS,
  fee: "0.1",
  treasury_account_id: TREASURY_ACCOUNT_ID,
  charging_mode: { charging_mode: "RETAIL_MONTHLY_ALLOWANCE", value: null },
  exemption_classes: ["TREASURY_PAYOUT"],
  reward_custody: rewardCustody(),
  ...overrides,
});

/** Native `ValidationFeeTreasuryPayoutBindingV1` in exact field order. */
export const validationFeePayoutBinding = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  contract_address: CONTRACT_ADDRESS,
  code_hash: "34".repeat(32),
  entrypoint: "autonomous_validation_fee_tick",
  treasury_account_id: TREASURY_ACCOUNT_ID,
  ds_asset_id: SBD_ASSET_ID,
  xor_asset_id: XOR_ASSET_ID,
  pool_contract_address: POOL_CONTRACT_ADDRESS,
  pool_code_hash: "36".repeat(32),
  pool_vault_account_id: POOL_VAULT_ACCOUNT_ID,
  reward_pool_account_id: REWARD_POOL_ACCOUNT_ID,
  reference_feed_id: ["xor_per_sbd"],
  reference_feed_config_version: 1,
  reference_provider_accounts: [...REFERENCE_PROVIDER_ACCOUNT_IDS],
  max_sbd_per_attempt_minor: 1_000,
  max_sbd_per_day_minor: 100_000,
  min_interval_ms: 60_000,
  max_source_age_ms: 300_000,
  max_slippage_bps: 100,
  validator_lane_id: 0,
  min_reward_claim_xor_minor: 1,
  ...overrides,
});
