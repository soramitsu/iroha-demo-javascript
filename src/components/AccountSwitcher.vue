<template>
  <div class="account-switcher">
    <div class="switcher-head">
      <div>
        <p class="eyebrow">{{ t("Active account") }}</p>
        <p class="switcher-title">{{ activeLabel }}</p>
      </div>
      <button class="secondary" @click="goToRegistration">
        {{ hasAccounts ? t("Register another") : t("Start registration") }}
      </button>
    </div>
    <div v-if="hasAccounts" class="switcher-body">
      <label class="sr-only" for="account-selector">{{
        t("Select account")
      }}</label>
      <select id="account-selector" v-model="selectedAccountId">
        <option
          v-for="account in session.accounts"
          :key="account.accountId"
          :value="account.accountId"
        >
          {{ getAccountOptionLabel(account) }}
        </option>
      </select>
      <p class="helper">
        {{ t("Switch between saved accounts without re-entering keys.") }}
      </p>
    </div>
    <p v-else class="helper">
      {{ t("No saved accounts yet. Start the registration flow to add one.") }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useAppI18n } from "@/composables/useAppI18n";
import { useSessionStore } from "@/stores/session";
import { getAccountDisplayLabel } from "@/utils/accountId";

const session = useSessionStore();
const router = useRouter();
const { t } = useAppI18n();

const selectedAccountId = ref(session.activeAccountId ?? "");
const hasAccounts = computed(() => session.accounts.length > 0);
const activeLabel = computed(() =>
  getAccountDisplayLabel(session.activeAccount, t("Not selected")),
);
const getAccountOptionLabel = (account: (typeof session.accounts)[number]) =>
  getAccountDisplayLabel(account, account.accountId);

watch(
  () => session.activeAccountId,
  (value) => {
    selectedAccountId.value = value ?? "";
  },
);

watch(
  () => selectedAccountId.value,
  (value) => {
    if (!value || value === session.activeAccountId) return;
    session.setActiveAccount(value);
    session.persistState();
  },
);

const goToRegistration = () => {
  router.push("/account");
};
</script>

<style scoped>
.account-switcher {
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 18px;
  border: 1px solid var(--panel-border);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.06), transparent 70%),
    var(--surface-soft);
  width: 100%;
}

.switcher-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.eyebrow {
  font-size: 0.8rem;
  color: var(--iroha-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0;
}

.switcher-title {
  font-weight: 700;
  margin: 4px 0 0;
  word-break: break-all;
  unicode-bidi: plaintext;
}

.switcher-body {
  display: grid;
  gap: 10px;
}

.switcher-body select {
  width: 100%;
}

.helper {
  margin: 0;
  font-size: 0.85rem;
  color: var(--iroha-muted);
  line-height: 1.45;
}

@media (max-width: 1180px) {
  .switcher-head {
    flex-direction: column;
  }
}

@media (max-width: 960px) {
  .account-switcher {
    padding: 12px 14px;
  }

  .switcher-head .secondary {
    width: 100%;
  }
}
</style>
