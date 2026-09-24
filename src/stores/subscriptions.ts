import { defineStore } from "pinia";
import { toRaw } from "vue";
import {
  cancelSubscription,
  chargeSubscriptionNow,
  createSubscription,
  keepSubscription,
  listSubscriptionPlans,
  listSubscriptions,
  pauseSubscription,
  reconcileSubscriptionMutation,
  resumeSubscription,
} from "@/services/iroha";
import type {
  SubscriptionActionResponseView,
  SubscriptionListItemView,
  SubscriptionMutationActionView,
  SubscriptionPlanListItemView,
} from "@/types/iroha";

export const SUBSCRIPTION_STORAGE_KEY = "iroha-demo:subscriptions";

type SubscriptionState = {
  hydrated: boolean;
  loading: boolean;
  recordsLoading: boolean;
  plansLoading: boolean;
  records: SubscriptionListItemView[];
  plans: SubscriptionPlanListItemView[];
  total: number;
  planTotal: number;
  error: string;
  recordsError: string;
  plansError: string;
  lastUpdatedAtMs: number | null;
  activeContext: SubscriptionDataContext | null;
  contextGeneration: number;
  requestGeneration: number;
  recordsGeneration: number | null;
  pendingReconciliations: SubscriptionPendingReconciliation[];
  mutationKeysInFlight: string[];
  reconcilingKey: string;
  reconciliationError: string;
};

export type SubscriptionDataContext = {
  toriiUrl: string;
  accountId: string;
  chainId: string;
  networkPrefix: number;
  observedChainId: string;
  observedNetworkPrefix: number | null;
  observedGenesisHash: string;
  identityStatus: string;
};

export type SubscriptionPendingReconciliation = {
  context: SubscriptionDataContext;
  action: SubscriptionMutationActionView;
  subscriptionId: string;
  transactionHash: string;
  finality: SubscriptionActionResponseView["finality"];
  message: string;
  recordedAtMs: number;
};

type RefreshInput = SubscriptionDataContext;

type SignedSubscriptionInput = RefreshInput & {
  subscriptionId: string;
};

type CreateSubscriptionInput = SignedSubscriptionInput & {
  planId: string;
  firstChargeMs?: number;
};

type CancelSubscriptionInput = SignedSubscriptionInput & {
  cancelMode: "immediate" | "period_end";
};

type ChargeSubscriptionInput = SignedSubscriptionInput & {
  chargeAtMs?: number;
};

const defaultState = (): SubscriptionState => ({
  hydrated: false,
  loading: false,
  recordsLoading: false,
  plansLoading: false,
  records: [],
  plans: [],
  total: 0,
  planTotal: 0,
  error: "",
  recordsError: "",
  plansError: "",
  lastUpdatedAtMs: null,
  activeContext: null,
  contextGeneration: 0,
  requestGeneration: 0,
  recordsGeneration: null,
  pendingReconciliations: [],
  mutationKeysInFlight: [],
  reconcilingKey: "",
  reconciliationError: "",
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? "Unknown error");

const normalizeSubscriptionContext = (
  input: RefreshInput,
): SubscriptionDataContext => {
  const toriiUrl = input.toriiUrl.trim();
  if (!toriiUrl) {
    throw new Error("Torii endpoint is required for subscription data.");
  }
  const chainId = input.chainId.trim();
  if (!chainId) {
    throw new Error("Chain id is required for subscription data.");
  }
  if (
    !Number.isInteger(input.networkPrefix) ||
    input.networkPrefix < 0 ||
    input.networkPrefix > 0x3fff
  ) {
    throw new Error("Network prefix is invalid for subscription data.");
  }
  if (
    input.observedNetworkPrefix !== null &&
    (!Number.isInteger(input.observedNetworkPrefix) ||
      input.observedNetworkPrefix < 0 ||
      input.observedNetworkPrefix > 0x3fff)
  ) {
    throw new Error(
      "Observed network prefix is invalid for subscription data.",
    );
  }
  const observedGenesisHash = input.observedGenesisHash.trim();
  if (observedGenesisHash && !/^[0-9a-f]{64}$/u.test(observedGenesisHash)) {
    throw new Error("Observed genesis hash is invalid for subscription data.");
  }
  return {
    toriiUrl,
    accountId: input.accountId.trim(),
    chainId,
    networkPrefix: input.networkPrefix,
    observedChainId: input.observedChainId.trim(),
    observedNetworkPrefix: input.observedNetworkPrefix,
    observedGenesisHash,
    identityStatus: input.identityStatus.trim(),
  };
};

const contextsMatch = (
  left: SubscriptionDataContext | null,
  right: SubscriptionDataContext | null,
) =>
  left?.toriiUrl === right?.toriiUrl &&
  left?.accountId === right?.accountId &&
  left?.chainId === right?.chainId &&
  left?.networkPrefix === right?.networkPrefix &&
  left?.observedChainId === right?.observedChainId &&
  left?.observedNetworkPrefix === right?.observedNetworkPrefix &&
  left?.observedGenesisHash === right?.observedGenesisHash &&
  left?.identityStatus === right?.identityStatus;

const subscriptionMutationKey = (
  context: SubscriptionDataContext,
  subscriptionId: string,
) =>
  JSON.stringify([
    context.toriiUrl,
    context.accountId,
    context.chainId,
    context.networkPrefix,
    context.observedChainId,
    context.observedNetworkPrefix,
    context.observedGenesisHash,
    context.identityStatus,
    subscriptionId,
  ]);

const pendingReconciliationKey = (pending: SubscriptionPendingReconciliation) =>
  subscriptionMutationKey(pending.context, pending.subscriptionId);

const assertSuccessfulSubscriptionResult = (
  result: SubscriptionActionResponseView,
  expectedSubscriptionId: string,
  expectedAction: SubscriptionMutationActionView,
) => {
  if (result.ok !== true) {
    throw new Error("Subscription response did not confirm success.");
  }
  if (result.action !== expectedAction) {
    throw new Error(
      "Subscription response does not match the requested action.",
    );
  }
  if (result.subscription_id !== expectedSubscriptionId) {
    throw new Error(
      "Subscription response does not match the requested subscription.",
    );
  }
  if (!/^[0-9a-f]{64}$/u.test(result.tx_hash_hex)) {
    throw new Error(
      "Subscription response did not include a valid transaction hash.",
    );
  }
  if (
    result.finality?.status !== "finalized" ||
    result.finality.transactionHash !== result.tx_hash_hex ||
    !Number.isSafeInteger(result.finality.blockHeight) ||
    result.finality.blockHeight < 1 ||
    !/^[0-9a-f]{64}$/u.test(result.finality.blockHash) ||
    !Number.isSafeInteger(result.finality.finalizedBlockHeight) ||
    result.finality.finalizedBlockHeight < result.finality.blockHeight
  ) {
    throw new Error(
      "Subscription response did not prove the transaction in a finalized block.",
    );
  }
  if (
    result.state_status !== "confirmed" &&
    result.state_status !== "advanced" &&
    result.state_status !== "indexing"
  ) {
    throw new Error(
      "Subscription response did not include authoritative state reconciliation.",
    );
  }
  if (
    result.state_status === "indexing" &&
    (typeof result.reconciliation_message !== "string" ||
      !result.reconciliation_message ||
      result.reconciliation_message.trim() !== result.reconciliation_message)
  ) {
    throw new Error(
      "Subscription indexing response did not include reconciliation guidance.",
    );
  }
};

const SUBSCRIPTION_PAGE_SIZE = 100;
const SUBSCRIPTION_MAX_ITEMS = 10_000;

const loadAllSubscriptionRecords = async (context: SubscriptionDataContext) => {
  const items: SubscriptionListItemView[] = [];
  const seen = new Set<string>();
  let expectedTotal: number | null = null;
  while (expectedTotal === null || items.length < expectedTotal) {
    const page = await listSubscriptions({
      toriiUrl: context.toriiUrl,
      ownedBy: context.accountId,
      limit: SUBSCRIPTION_PAGE_SIZE,
      offset: items.length,
    });
    if (
      !Number.isSafeInteger(page.total) ||
      page.total < 0 ||
      page.total > SUBSCRIPTION_MAX_ITEMS ||
      !Array.isArray(page.items) ||
      page.items.length > SUBSCRIPTION_PAGE_SIZE ||
      (expectedTotal !== null && page.total !== expectedTotal)
    ) {
      throw new Error("Subscription pagination returned an invalid total.");
    }
    expectedTotal ??= page.total;
    if (page.items.length === 0 && items.length < expectedTotal) {
      throw new Error(
        "Subscription pagination ended before its declared total.",
      );
    }
    for (const item of page.items) {
      if (seen.has(item.subscription_id)) {
        throw new Error("Subscription pagination returned a duplicate id.");
      }
      seen.add(item.subscription_id);
      items.push(item);
    }
    if (items.length > expectedTotal) {
      throw new Error("Subscription pagination exceeded its declared total.");
    }
  }
  return { items, total: expectedTotal };
};

const loadAllSubscriptionPlans = async (context: SubscriptionDataContext) => {
  const items: SubscriptionPlanListItemView[] = [];
  const seen = new Set<string>();
  let expectedTotal: number | null = null;
  while (expectedTotal === null || items.length < expectedTotal) {
    const page = await listSubscriptionPlans({
      toriiUrl: context.toriiUrl,
      limit: SUBSCRIPTION_PAGE_SIZE,
      offset: items.length,
    });
    if (
      !Number.isSafeInteger(page.total) ||
      page.total < 0 ||
      page.total > SUBSCRIPTION_MAX_ITEMS ||
      !Array.isArray(page.items) ||
      page.items.length > SUBSCRIPTION_PAGE_SIZE ||
      (expectedTotal !== null && page.total !== expectedTotal)
    ) {
      throw new Error(
        "Subscription plan pagination returned an invalid total.",
      );
    }
    expectedTotal ??= page.total;
    if (page.items.length === 0 && items.length < expectedTotal) {
      throw new Error(
        "Subscription plan pagination ended before its declared total.",
      );
    }
    for (const item of page.items) {
      if (seen.has(item.plan_id)) {
        throw new Error(
          "Subscription plan pagination returned a duplicate id.",
        );
      }
      seen.add(item.plan_id);
      items.push(item);
    }
    if (items.length > expectedTotal) {
      throw new Error(
        "Subscription plan pagination exceeded its declared total.",
      );
    }
  }
  return { items, total: expectedTotal };
};

type SubscriptionRecordOwnership = {
  store: object;
  contextGeneration: number;
  recordsGeneration: number;
};

const subscriptionRecordOwnership = new WeakMap<
  object,
  SubscriptionRecordOwnership
>();

const staleSubscriptionRecordError = () =>
  new Error(
    "Subscription record does not belong to the active endpoint and account context.",
  );

export const useSubscriptionStore = defineStore("subscriptions", {
  state: defaultState,
  actions: {
    hydrate() {
      if (this.hydrated) return;
      localStorage.removeItem(SUBSCRIPTION_STORAGE_KEY);
      this.hydrated = true;
    },
    activateContext(input: RefreshInput | null) {
      const context = input ? normalizeSubscriptionContext(input) : null;
      if (contextsMatch(this.activeContext, context)) {
        return;
      }
      this.contextGeneration += 1;
      this.requestGeneration += 1;
      this.activeContext = context;
      this.loading = false;
      this.recordsLoading = false;
      this.plansLoading = false;
      this.records = [];
      this.plans = [];
      this.total = 0;
      this.planTotal = 0;
      this.error = "";
      this.recordsError = "";
      this.plansError = "";
      this.lastUpdatedAtMs = null;
      this.recordsGeneration = null;
      this.reconciliationError = "";
    },
    isCurrentContext(input: RefreshInput) {
      return contextsMatch(
        this.activeContext,
        normalizeSubscriptionContext(input),
      );
    },
    ownsRecord(record: SubscriptionListItemView, input: RefreshInput): boolean {
      if (!this.isCurrentContext(input) || this.recordsGeneration === null) {
        return false;
      }
      const rawRecord = toRaw(record);
      const ownership = subscriptionRecordOwnership.get(rawRecord);
      return Boolean(
        ownership &&
          ownership.store === toRaw(this) &&
          ownership.contextGeneration === this.contextGeneration &&
          ownership.recordsGeneration === this.recordsGeneration &&
          this.records.some((current) => toRaw(current) === rawRecord),
      );
    },
    pendingForContext(
      input: RefreshInput,
    ): SubscriptionPendingReconciliation[] {
      const context = normalizeSubscriptionContext(input);
      return this.pendingReconciliations.filter((pending) =>
        contextsMatch(pending.context, context),
      );
    },
    hasPendingForSubscription(
      input: RefreshInput,
      subscriptionId: string,
    ): boolean {
      const context = normalizeSubscriptionContext(input);
      const key = subscriptionMutationKey(context, subscriptionId);
      return this.pendingReconciliations.some(
        (pending) => pendingReconciliationKey(pending) === key,
      );
    },
    isReconciling(pending: SubscriptionPendingReconciliation): boolean {
      return (
        this.reconcilingKey ===
        JSON.stringify([
          pendingReconciliationKey(pending),
          pending.action,
          pending.transactionHash,
        ])
      );
    },
    async refresh(input: RefreshInput) {
      const context = normalizeSubscriptionContext(input);
      this.activateContext(context);
      const contextGeneration = this.contextGeneration;
      const requestGeneration = this.requestGeneration + 1;
      this.requestGeneration = requestGeneration;
      this.loading = true;
      this.error = "";
      this.recordsLoading = true;
      this.plansLoading = true;
      this.recordsError = "";
      this.plansError = "";
      const ownsRequest = () =>
        this.contextGeneration === contextGeneration &&
        this.requestGeneration === requestGeneration &&
        contextsMatch(this.activeContext, context);
      const updateCombinedState = () => {
        this.loading = this.recordsLoading || this.plansLoading;
        this.error = [this.recordsError, this.plansError]
          .filter(Boolean)
          .join(" ");
        this.lastUpdatedAtMs = Date.now();
      };
      const refreshRecords = async () => {
        try {
          const response = context.accountId
            ? await loadAllSubscriptionRecords(context)
            : { items: [], total: 0 };
          if (!ownsRequest()) return;
          this.records = response.items;
          this.total = response.total;
          this.recordsGeneration = requestGeneration;
          const store = toRaw(this);
          for (const record of response.items) {
            subscriptionRecordOwnership.set(toRaw(record), {
              store,
              contextGeneration,
              recordsGeneration: requestGeneration,
            });
          }
        } catch (error) {
          if (!ownsRequest()) return;
          this.records = [];
          this.total = 0;
          this.recordsGeneration = null;
          this.recordsError = errorMessage(error);
        } finally {
          if (ownsRequest()) {
            this.recordsLoading = false;
            updateCombinedState();
          }
        }
      };
      const refreshPlans = async () => {
        try {
          const response = await loadAllSubscriptionPlans(context);
          if (!ownsRequest()) return;
          this.plans = response.items;
          this.planTotal = response.total;
        } catch (error) {
          if (!ownsRequest()) return;
          this.plans = [];
          this.planTotal = 0;
          this.plansError = errorMessage(error);
        } finally {
          if (ownsRequest()) {
            this.plansLoading = false;
            updateCombinedState();
          }
        }
      };
      await Promise.allSettled([refreshRecords(), refreshPlans()]);
    },
    async performMutation(
      input: SignedSubscriptionInput,
      action: SubscriptionMutationActionView,
      execute: () => Promise<SubscriptionActionResponseView>,
    ) {
      if (!this.isCurrentContext(input)) {
        throw new Error(
          "Subscription action does not match the active endpoint and account context.",
        );
      }
      const context = normalizeSubscriptionContext(input);
      const mutationKey = subscriptionMutationKey(
        context,
        input.subscriptionId,
      );
      if (
        this.pendingReconciliations.some(
          (pending) => pendingReconciliationKey(pending) === mutationKey,
        )
      ) {
        throw new Error(
          "A finalized transaction for this subscription is still indexing. Reconcile it before submitting another action.",
        );
      }
      if (this.mutationKeysInFlight.includes(mutationKey)) {
        throw new Error(
          "A subscription transaction for this subscription is already in progress.",
        );
      }
      this.mutationKeysInFlight = [...this.mutationKeysInFlight, mutationKey];
      try {
        const result = await execute();
        assertSuccessfulSubscriptionResult(
          result,
          input.subscriptionId,
          action,
        );
        if (result.state_status === "indexing") {
          const pending: SubscriptionPendingReconciliation = {
            context,
            action,
            subscriptionId: input.subscriptionId,
            transactionHash: result.tx_hash_hex,
            finality: result.finality,
            message: result.reconciliation_message!,
            recordedAtMs: Date.now(),
          };
          this.pendingReconciliations = [
            ...this.pendingReconciliations.filter(
              (current) => pendingReconciliationKey(current) !== mutationKey,
            ),
            pending,
          ];
        } else {
          this.pendingReconciliations = this.pendingReconciliations.filter(
            (pending) => pendingReconciliationKey(pending) !== mutationKey,
          );
        }
        return result;
      } finally {
        this.mutationKeysInFlight = this.mutationKeysInFlight.filter(
          (current) => current !== mutationKey,
        );
      }
    },
    create(input: CreateSubscriptionInput) {
      return this.performMutation(input, "create", () =>
        createSubscription(input),
      );
    },
    pause(record: SubscriptionListItemView, input: SignedSubscriptionInput) {
      if (
        input.subscriptionId !== record.subscription_id ||
        !this.ownsRecord(record, input)
      ) {
        throw staleSubscriptionRecordError();
      }
      return this.performMutation(input, "pause", () =>
        pauseSubscription(input),
      );
    },
    resume(record: SubscriptionListItemView, input: ChargeSubscriptionInput) {
      if (
        input.subscriptionId !== record.subscription_id ||
        !this.ownsRecord(record, input)
      ) {
        throw staleSubscriptionRecordError();
      }
      return this.performMutation(input, "resume", () =>
        resumeSubscription(input),
      );
    },
    cancel(record: SubscriptionListItemView, input: CancelSubscriptionInput) {
      if (
        input.subscriptionId !== record.subscription_id ||
        !this.ownsRecord(record, input)
      ) {
        throw staleSubscriptionRecordError();
      }
      return this.performMutation(input, "cancel", () =>
        cancelSubscription(input),
      );
    },
    keep(record: SubscriptionListItemView, input: SignedSubscriptionInput) {
      if (
        input.subscriptionId !== record.subscription_id ||
        !this.ownsRecord(record, input)
      ) {
        throw staleSubscriptionRecordError();
      }
      return this.performMutation(input, "keep", () => keepSubscription(input));
    },
    chargeNow(
      record: SubscriptionListItemView,
      input: ChargeSubscriptionInput,
    ) {
      if (
        input.subscriptionId !== record.subscription_id ||
        !this.ownsRecord(record, input)
      ) {
        throw staleSubscriptionRecordError();
      }
      return this.performMutation(input, "charge_now", () =>
        chargeSubscriptionNow(input),
      );
    },
    async reconcilePending(
      pending: SubscriptionPendingReconciliation,
      input: RefreshInput,
    ) {
      const context = normalizeSubscriptionContext(input);
      if (
        !contextsMatch(this.activeContext, context) ||
        !contextsMatch(pending.context, context)
      ) {
        throw new Error(
          "Subscription reconciliation does not match the active endpoint and account context.",
        );
      }
      const pendingKey = pendingReconciliationKey(pending);
      const current = this.pendingReconciliations.find(
        (candidate) =>
          pendingReconciliationKey(candidate) === pendingKey &&
          candidate.action === pending.action &&
          candidate.transactionHash === pending.transactionHash,
      );
      if (!current) {
        throw new Error(
          "There is no matching finalized subscription transaction to reconcile.",
        );
      }
      const reconcileKey = JSON.stringify([
        pendingKey,
        current.action,
        current.transactionHash,
      ]);
      if (this.reconcilingKey) {
        throw new Error(
          "A subscription reconciliation read is already in progress.",
        );
      }
      this.reconcilingKey = reconcileKey;
      this.reconciliationError = "";
      try {
        const result = await reconcileSubscriptionMutation({
          toriiUrl: context.toriiUrl,
          chainId: context.chainId,
          networkPrefix: context.networkPrefix,
          accountId: context.accountId,
          subscriptionId: current.subscriptionId,
          action: current.action,
          transactionHash: current.transactionHash,
        });
        assertSuccessfulSubscriptionResult(
          result,
          current.subscriptionId,
          current.action,
        );
        if (result.tx_hash_hex !== current.transactionHash) {
          throw new Error(
            "Subscription reconciliation returned a different finalized transaction.",
          );
        }
        if (result.state_status === "indexing") {
          this.pendingReconciliations = this.pendingReconciliations.map(
            (candidate) =>
              pendingReconciliationKey(candidate) === pendingKey &&
              candidate.action === current.action &&
              candidate.transactionHash === current.transactionHash
                ? {
                    ...candidate,
                    message: result.reconciliation_message!,
                  }
                : candidate,
          );
        } else {
          this.pendingReconciliations = this.pendingReconciliations.filter(
            (candidate) =>
              !(
                pendingReconciliationKey(candidate) === pendingKey &&
                candidate.action === current.action &&
                candidate.transactionHash === current.transactionHash
              ),
          );
        }
        return result;
      } catch (error) {
        if (contextsMatch(this.activeContext, context)) {
          this.reconciliationError = errorMessage(error);
        }
        throw error;
      } finally {
        if (this.reconcilingKey === reconcileKey) {
          this.reconcilingKey = "";
        }
      }
    },
  },
});
