<template>
  <div class="account-switcher">
    <div class="switcher-head">
      <div>
        <p class="eyebrow">Active account</p>
        <p class="switcher-title">{{ activeLabel }}</p>
      </div>
      <button class="secondary" @click="goToRegistration">
        {{ hasAccounts ? "Register another" : "Start registration" }}
      </button>
    </div>
    <div v-if="hasAccounts" class="switcher-body">
      <label class="sr-only" for="account-selector">Select account</label>
      <select id="account-selector" v-model="selectedAccountId">
        <option
          v-for="account in session.accounts"
          :key="account.accountId"
          :value="account.accountId"
        >
          {{ account.displayName || account.accountId }}
        </option>
      </select>
      <p class="helper">
        Switch between saved accounts without re-entering keys.
      </p>
    </div>
    <p v-else class="helper">
      No saved accounts yet. Start the registration flow to add one.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useSessionStore } from "@/stores/session";

const session = useSessionStore();
const router = useRouter();

const selectedAccountId = ref(session.activeAccountId ?? "");
const hasAccounts = computed(() => session.accounts.length > 0);
const activeLabel = computed(
  () =>
    session.activeAccount?.displayName ||
    session.activeAccount?.accountId ||
    "Not selected",
);

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
  gap: 8px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid var(--panel-border);
  background: var(--surface-soft);
  width: 100%;
}

.switcher-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
  margin: 2px 0 0;
}

.switcher-body select {
  width: 100%;
}

.helper {
  margin: 0;
  font-size: 0.85rem;
  color: var(--iroha-muted);
}
</style>
