import type { ToriiClient } from "@iroha/iroha-js";
import {
  confidentialModeSupportsShield,
  isPositiveWholeAmount,
} from "../src/utils/confidential";
import { sanitizeErrorMessage } from "../src/utils/errorMessage";

export { confidentialModeSupportsShield, isPositiveWholeAmount };

export type ExplorerAccountQrResponse = Awaited<
  ReturnType<ToriiClient["getExplorerAccountQr"]>
>;

export interface PublicLaneValidatorStatusView {
  type: string;
  activates_at_epoch: number | null;
  reason: string | null;
  releases_at_ms: number | null;
  slash_id: string | null;
}

export interface PublicLaneValidatorRecordView {
  lane_id: number;
  validator: string;
  stake_account: string;
  total_stake: string;
  self_stake: string;
  status: PublicLaneValidatorStatusView;
  activation_epoch: number | null;
  activation_height: number | null;
  last_reward_epoch: number | null;
  metadata: Record<string, unknown>;
}

export interface PublicLaneValidatorsResponseView {
  lane_id: number;
  total: number;
  items: PublicLaneValidatorRecordView[];
}

export interface PublicLaneUnbondingView {
  request_id: string;
  amount: string;
  release_at_ms: number;
}

export interface PublicLaneStakeShareView {
  lane_id: number;
  validator: string;
  staker: string;
  bonded: string;
  metadata: Record<string, unknown>;
  pending_unbonds: PublicLaneUnbondingView[];
}

export interface PublicLaneStakeResponseView {
  lane_id: number;
  total: number;
  items: PublicLaneStakeShareView[];
}

export interface PublicLanePendingRewardView {
  lane_id: number;
  account: string;
  asset: string;
  last_claimed_epoch: number;
  pending_through_epoch: number;
  amount: string;
}

export interface PublicLaneRewardsResponseView {
  lane_id: number;
  total: number;
  items: PublicLanePendingRewardView[];
}

export interface ConfidentialPolicyTransitionView {
  transition_id: string;
  previous_mode: string;
  new_mode: string;
  effective_height: number;
  conversion_window: number | null;
  window_open_height: number | null;
}

export interface ConfidentialAssetPolicyView {
  asset_id: string;
  block_height: number;
  current_mode: string;
  effective_mode: string;
  vk_set_hash: string | null;
  poseidon_params_id: number | null;
  pedersen_params_id: number | null;
  pending_transition: ConfidentialPolicyTransitionView | null;
}

export interface AccountAssetListItemView {
  asset_id: string;
  quantity: string;
}

export interface AccountAssetListResponseView {
  items: AccountAssetListItemView[];
  total: number;
}

const toRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const toPositiveInteger = (value: unknown, label: string) => {
  const numberValue =
    typeof value === "string" && value.trim().length
      ? Number(value)
      : Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return Math.floor(numberValue);
};

const toNullableInteger = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  return toPositiveInteger(value, "numeric field");
};

const toStringValue = (value: unknown, label: string) => {
  const out = String(value ?? "").trim();
  if (!out) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return out;
};

const toMetadataRecord = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
};

const toArray = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value;
};

export const normalizeBaseUrl = (url: string) => {
  const trimmed = url.trim().replace(/\/$/, "");
  if (!trimmed.startsWith("http")) {
    throw new Error("Torii URL must include http or https scheme");
  }
  return trimmed;
};

const GENERIC_API_ERROR_DETAILS = new Set([
  "faucet puzzle failed",
  "faucet request failed",
  "request failed",
  "forbidden",
  "bad request",
  "internal server error",
  "too many requests",
]);

const normalizeApiErrorDetail = (value: string): string =>
  value.trim().replace(/\.+$/, "").toLowerCase();

const isGenericApiErrorDetail = (value: string): boolean =>
  GENERIC_API_ERROR_DETAILS.has(normalizeApiErrorDetail(value));

const collectApiErrorDetails = (payload: unknown): string[] => {
  if (typeof payload === "string") {
    const detail = payload.trim();
    return detail ? [detail] : [];
  }
  if (typeof payload === "number" || typeof payload === "boolean") {
    return [String(payload)];
  }
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => collectApiErrorDetails(item));
  }
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const priorityKeys = [
    "detail",
    "details",
    "message",
    "error",
    "errors",
    "reason",
    "cause",
  ];
  const details: string[] = [];

  for (const key of priorityKeys) {
    details.push(...collectApiErrorDetails(record[key]));
  }

  for (const [key, value] of Object.entries(record)) {
    if (priorityKeys.includes(key)) {
      continue;
    }
    details.push(...collectApiErrorDetails(value));
  }

  return details;
};

export const extractApiErrorDetail = (payload: unknown): string => {
  const details = collectApiErrorDetails(payload)
    .map((detail) => sanitizeErrorMessage(detail))
    .filter(Boolean);
  return (
    details.find((detail) => !isGenericApiErrorDetail(detail)) ??
    details[0] ??
    ""
  );
};

export const readApiErrorDetail = async (
  response: Pick<Response, "text">,
): Promise<string> => {
  const text = (await response.text().catch(() => "")).trim();
  if (!text) {
    return "";
  }

  try {
    return sanitizeErrorMessage(extractApiErrorDetail(JSON.parse(text)) || text);
  } catch {
    return sanitizeErrorMessage(text);
  }
};

export const formatOnboardingError = (input: {
  status: number;
  statusText: string;
  detail?: string;
}) => {
  const detail = String(input.detail ?? "").trim();
  if (input.status === 403) {
    const guidance =
      "UAID alias registration is disabled on this Torii endpoint. Save the wallet locally instead, or use authority registration if you need the account on-chain.";
    return detail
      ? `Alias registration failed with status ${input.status} (${input.statusText}): ${guidance} Detail: ${detail}`
      : `Alias registration failed with status ${input.status} (${input.statusText}): ${guidance}`;
  }
  return detail
    ? `Alias registration failed with status ${input.status} (${input.statusText}): ${detail}`
    : `Alias registration failed with status ${input.status} (${input.statusText})`;
};

export const normalizeExplorerAccountQrPayload = (
  payload: Record<string, unknown>,
): ExplorerAccountQrResponse => {
  const canonicalId = String(payload.canonicalId ?? payload.canonical_id ?? "");
  const literal = String(payload.literal ?? "");
  const networkPrefix = Number(
    payload.networkPrefix ?? payload.network_prefix ?? 0,
  );
  const errorCorrection = String(
    payload.errorCorrection ?? payload.error_correction ?? "",
  );
  const modules = Number(payload.modules ?? 0);
  const qrVersion = Number(payload.qrVersion ?? payload.qr_version ?? 0);
  const svg = String(payload.svg ?? "");

  if (!canonicalId || !literal || !svg) {
    throw new Error("Explorer QR response was missing required fields.");
  }

  return {
    canonicalId,
    literal,
    networkPrefix,
    errorCorrection,
    modules,
    qrVersion,
    svg,
  };
};

export const normalizeAccountAssetListPayload = (
  payload: unknown,
): AccountAssetListResponseView => {
  const record = toRecord(payload, "account asset list response");
  const items = toArray(record.items, "account asset list response.items").map(
    (value, index) => {
      const entry = toRecord(
        value,
        `account asset list response.items[${index}]`,
      );
      const legacyAssetId = String(entry.asset_id ?? "").trim();
      const assetDefinitionId = String(entry.asset ?? "").trim();
      const accountId = String(entry.account_id ?? "").trim();
      const assetId =
        legacyAssetId ||
        (assetDefinitionId && accountId
          ? `${assetDefinitionId}#${accountId}`
          : "");
      if (!assetId) {
        throw new Error(
          `account asset list response.items[${index}].asset_id must be a string`,
        );
      }
      return {
        asset_id: assetId,
        quantity: toStringValue(
          entry.quantity,
          `account asset list response.items[${index}].quantity`,
        ),
      };
    },
  );
  return {
    items,
    total: toPositiveInteger(
      record.total ?? items.length,
      "account asset list response.total",
    ),
  };
};

export const normalizePublicLaneValidatorsPayload = (
  payload: Record<string, unknown>,
): PublicLaneValidatorsResponseView => {
  const laneId = toPositiveInteger(
    payload.lane_id ?? payload.laneId,
    "validators.lane_id",
  );
  const total = toPositiveInteger(payload.total ?? 0, "validators.total");
  const rawItems = toArray(payload.items ?? [], "validators.items");

  const items: PublicLaneValidatorRecordView[] = rawItems.map(
    (raw, index): PublicLaneValidatorRecordView => {
      const item = toRecord(raw, `validators.items[${index}]`);
      const statusRecord = toRecord(
        item.status ?? {},
        `validators.items[${index}].status`,
      );
      return {
        lane_id: toPositiveInteger(
          item.lane_id ?? item.laneId ?? laneId,
          `validators.items[${index}].lane_id`,
        ),
        validator: toStringValue(
          item.validator,
          `validators.items[${index}].validator`,
        ),
        stake_account: toStringValue(
          item.stake_account ?? item.stakeAccount,
          `validators.items[${index}].stake_account`,
        ),
        total_stake: toStringValue(
          item.total_stake ?? item.totalStake,
          `validators.items[${index}].total_stake`,
        ),
        self_stake: toStringValue(
          item.self_stake ?? item.selfStake,
          `validators.items[${index}].self_stake`,
        ),
        status: {
          type: toStringValue(
            statusRecord.type,
            `validators.items[${index}].status.type`,
          ),
          activates_at_epoch: toNullableInteger(
            statusRecord.activates_at_epoch ?? statusRecord.activatesAtEpoch,
          ),
          reason:
            statusRecord.reason === null || statusRecord.reason === undefined
              ? null
              : String(statusRecord.reason),
          releases_at_ms: toNullableInteger(
            statusRecord.releases_at_ms ?? statusRecord.releasesAtMs,
          ),
          slash_id:
            statusRecord.slash_id === null ||
            statusRecord.slash_id === undefined
              ? null
              : String(statusRecord.slash_id),
        },
        activation_epoch: toNullableInteger(
          item.activation_epoch ?? item.activationEpoch,
        ),
        activation_height: toNullableInteger(
          item.activation_height ?? item.activationHeight,
        ),
        last_reward_epoch: toNullableInteger(
          item.last_reward_epoch ?? item.lastRewardEpoch,
        ),
        metadata: toMetadataRecord(item.metadata),
      };
    },
  );

  return {
    lane_id: laneId,
    total,
    items,
  };
};

export const normalizePublicLaneStakePayload = (
  payload: Record<string, unknown>,
): PublicLaneStakeResponseView => {
  const laneId = toPositiveInteger(
    payload.lane_id ?? payload.laneId,
    "stake.lane_id",
  );
  const total = toPositiveInteger(payload.total ?? 0, "stake.total");
  const rawItems = toArray(payload.items ?? [], "stake.items");

  const items: PublicLaneStakeShareView[] = rawItems.map((raw, index) => {
    const item = toRecord(raw, `stake.items[${index}]`);
    const rawUnbonds = toArray(
      item.pending_unbonds ?? item.pendingUnbonds ?? [],
      `stake.items[${index}].pending_unbonds`,
    );
    const pending_unbonds: PublicLaneUnbondingView[] = rawUnbonds.map(
      (unbondRaw, unbondIndex) => {
        const unbond = toRecord(
          unbondRaw,
          `stake.items[${index}].pending_unbonds[${unbondIndex}]`,
        );
        return {
          request_id: toStringValue(
            unbond.request_id ?? unbond.requestId,
            `stake.items[${index}].pending_unbonds[${unbondIndex}].request_id`,
          ),
          amount: toStringValue(
            unbond.amount,
            `stake.items[${index}].pending_unbonds[${unbondIndex}].amount`,
          ),
          release_at_ms: toPositiveInteger(
            unbond.release_at_ms ?? unbond.releaseAtMs,
            `stake.items[${index}].pending_unbonds[${unbondIndex}].release_at_ms`,
          ),
        };
      },
    );

    return {
      lane_id: toPositiveInteger(
        item.lane_id ?? item.laneId ?? laneId,
        `stake.items[${index}].lane_id`,
      ),
      validator: toStringValue(
        item.validator,
        `stake.items[${index}].validator`,
      ),
      staker: toStringValue(item.staker, `stake.items[${index}].staker`),
      bonded: toStringValue(item.bonded, `stake.items[${index}].bonded`),
      metadata: toMetadataRecord(item.metadata),
      pending_unbonds,
    };
  });

  return {
    lane_id: laneId,
    total,
    items,
  };
};

export const normalizePublicLaneRewardsPayload = (
  payload: Record<string, unknown>,
): PublicLaneRewardsResponseView => {
  const laneId = toPositiveInteger(
    payload.lane_id ?? payload.laneId,
    "rewards.lane_id",
  );
  const total = toPositiveInteger(payload.total ?? 0, "rewards.total");
  const rawItems = toArray(payload.items ?? [], "rewards.items");

  const items: PublicLanePendingRewardView[] = rawItems.map((raw, index) => {
    const item = toRecord(raw, `rewards.items[${index}]`);
    return {
      lane_id: toPositiveInteger(
        item.lane_id ?? item.laneId ?? laneId,
        `rewards.items[${index}].lane_id`,
      ),
      account: toStringValue(item.account, `rewards.items[${index}].account`),
      asset: toStringValue(item.asset, `rewards.items[${index}].asset`),
      last_claimed_epoch: toPositiveInteger(
        item.last_claimed_epoch ?? item.lastClaimedEpoch,
        `rewards.items[${index}].last_claimed_epoch`,
      ),
      pending_through_epoch: toPositiveInteger(
        item.pending_through_epoch ?? item.pendingThroughEpoch,
        `rewards.items[${index}].pending_through_epoch`,
      ),
      amount: toStringValue(item.amount, `rewards.items[${index}].amount`),
    };
  });

  return {
    lane_id: laneId,
    total,
    items,
  };
};

export const normalizeConfidentialAssetPolicyPayload = (
  payload: Record<string, unknown>,
): ConfidentialAssetPolicyView => {
  const asset_id = toStringValue(
    payload.asset_id ?? payload.assetId,
    "confidential.asset_id",
  );
  const block_height = toPositiveInteger(
    payload.block_height ?? payload.blockHeight ?? 0,
    "confidential.block_height",
  );
  const current_mode = toStringValue(
    payload.current_mode ?? payload.currentMode,
    "confidential.current_mode",
  );
  const effective_mode = toStringValue(
    payload.effective_mode ?? payload.effectiveMode ?? current_mode,
    "confidential.effective_mode",
  );

  const pendingTransitionRaw =
    payload.pending_transition ?? payload.pendingTransition;
  let pending_transition: ConfidentialPolicyTransitionView | null = null;
  if (pendingTransitionRaw !== null && pendingTransitionRaw !== undefined) {
    const pending = toRecord(
      pendingTransitionRaw,
      "confidential.pending_transition",
    );
    pending_transition = {
      transition_id: toStringValue(
        pending.transition_id ?? pending.transitionId,
        "confidential.pending_transition.transition_id",
      ),
      previous_mode: toStringValue(
        pending.previous_mode ?? pending.previousMode,
        "confidential.pending_transition.previous_mode",
      ),
      new_mode: toStringValue(
        pending.new_mode ?? pending.newMode,
        "confidential.pending_transition.new_mode",
      ),
      effective_height: toPositiveInteger(
        pending.effective_height ?? pending.effectiveHeight,
        "confidential.pending_transition.effective_height",
      ),
      conversion_window: toNullableInteger(
        pending.conversion_window ?? pending.conversionWindow,
      ),
      window_open_height: toNullableInteger(
        pending.window_open_height ?? pending.windowOpenHeight,
      ),
    };
  }

  const vkSetHashRaw = payload.vk_set_hash ?? payload.vkSetHash;
  const vk_set_hash =
    vkSetHashRaw === undefined ||
    vkSetHashRaw === null ||
    String(vkSetHashRaw).trim().length === 0
      ? null
      : String(vkSetHashRaw);

  return {
    asset_id,
    block_height,
    current_mode,
    effective_mode,
    vk_set_hash,
    poseidon_params_id: toNullableInteger(
      payload.poseidon_params_id ?? payload.poseidonParamsId,
    ),
    pedersen_params_id: toNullableInteger(
      payload.pedersen_params_id ?? payload.pedersenParamsId,
    ),
    pending_transition,
  };
};

export const readNexusUnbondingDelayMs = (
  payload: Record<string, unknown>,
): number => {
  const root = toRecord(payload, "configuration");
  const nexus = toRecord(root.nexus ?? {}, "configuration.nexus");
  const staking = toRecord(nexus.staking ?? {}, "configuration.nexus.staking");
  const raw =
    staking.unbonding_delay_ms ??
    staking.unbondingDelayMs ??
    staking.unbonding_delay;
  return toPositiveInteger(
    raw,
    "configuration.nexus.staking.unbonding_delay_ms",
  );
};

export const sanitizeFetchHeaders = (
  headers: unknown,
): HeadersInit | undefined => {
  if (!headers) return undefined;

  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return Array.from(headers.entries());
  }

  if (Array.isArray(headers)) {
    return headers
      .filter(
        (entry): entry is [unknown, unknown] =>
          Array.isArray(entry) && entry.length >= 2,
      )
      .map<[string, string]>(([key, value]) => [String(key), String(value)]);
  }

  if (typeof headers === "object") {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      headers as Record<string, unknown>,
    )) {
      if (value === undefined || value === null) continue;
      normalized[key] = String(value);
    }
    return normalized;
  }

  return undefined;
};

export const sanitizeFetchInit = (
  init?: Parameters<typeof fetch>[1],
): Parameters<typeof fetch>[1] | undefined => {
  if (!init) return init;
  const headers = sanitizeFetchHeaders((init as { headers?: unknown }).headers);
  if (!headers) return init;
  return {
    ...init,
    headers,
  };
};
