<template>
  <div class="setup-shell">
    <section class="card setup-connection-card">
      <header class="card-header">
        <h2>{{ t("Torii Connection") }}</h2>
        <span class="status-pill" :class="pingIndicator.class">
          {{ pingIndicator.label }}
        </span>
      </header>
      <div class="chain-picker">
        <div class="preset-row">
          <div class="preset-chip active fixed" role="status">
            <span class="chip-title">{{ t("TAIRA Testnet") }}</span>
            <span class="chip-sub">{{
              t("Public TAIRA testnet profile.")
            }}</span>
          </div>
        </div>
      </div>
      <div class="form-grid">
        <label>
          {{ t("Torii URL") }}
          <input v-model="connectionForm.toriiUrl" readonly />
        </label>
        <label>
          {{ t("Chain ID") }}
          <input v-model="connectionForm.chainId" readonly />
        </label>
        <label>
          {{ t("Asset Definition ID") }}
          <input
            v-model="connectionForm.assetDefinitionId"
            :placeholder="t('norito:<asset-id-hex>')"
          />
        </label>
        <label>
          {{ t("Network Prefix") }}
          <input
            v-model.number="connectionForm.networkPrefix"
            type="number"
            min="0"
            max="16383"
            readonly
          />
        </label>
      </div>
      <div class="actions">
        <button :disabled="pingLoading" @click="handlePing">
          {{ t("Check health") }}
        </button>
        <button class="secondary" @click="saveConnection">
          {{ t("Save") }}
        </button>
      </div>
      <p v-if="pingMessage" class="helper">{{ pingMessage }}</p>
    </section>

    <section class="card setup-identity-card">
      <header class="card-header">
        <h2>{{ t("Key Material") }}</h2>
      </header>
      <div class="form-grid">
        <label>
          {{ t("Display Name (local only, not on-chain)") }}
          <input v-model="userForm.displayName" :placeholder="t('Alice')" />
        </label>
        <label>
          {{ t("Domain") }}
          <input v-model="userForm.domain" :placeholder="t('default')" />
        </label>
        <label>
          {{ t("Private Key (hex)") }}
          <textarea
            v-model="userForm.privateKeyHex"
            rows="2"
            :placeholder="t('64 hex chars')"
          ></textarea>
        </label>
        <label>
          {{ t("Public Key") }}
          <textarea
            v-model="userForm.publicKeyHex"
            rows="2"
            :placeholder="t('auto-derived')"
            readonly
          ></textarea>
        </label>
        <label>
          {{ t("Canonical I105 Account ID") }}
          <input
            :value="
              userForm.i105DefaultAccountId ||
              userForm.i105AccountId ||
              userForm.accountId
            "
            readonly
          />
        </label>
      </div>
      <p class="helper">
        {{
          t(
            "Use the real TAIRA I105 literal, for example {example}. Do not use @domain, legacy compatibility literals, or i105: forms.",
            {
              example: t("Example I105 Account ID"),
            },
          )
        }}
      </p>
      <p class="helper">
        {{
          t(
            "The domain label defaults to {domain}. It is a neutral SDK label for local derivation, not a TAIRA dataspace alias.",
            {
              domain: t("default"),
            },
          )
        }}
      </p>
      <div class="actions">
        <button :disabled="generating" @click="handleGenerate">
          {{ t("Generate pair") }}
        </button>
        <button
          class="secondary"
          :disabled="!userForm.privateKeyHex"
          @click="handleDerivePublic"
        >
          {{ t("Derive from private key") }}
        </button>
        <button class="secondary" @click="saveUser">
          {{ t("Save identity") }}
        </button>
      </div>
    </section>

    <section class="card setup-register-card">
      <header class="card-header">
        <h2>{{ t("Create on-chain account") }}</h2>
        <p class="helper">
          {{
            t("Requires authority credentials to create the account on-chain.")
          }}
        </p>
      </header>
      <div class="form-grid">
        <label>
          {{ t("Authority Account ID") }}
          <input
            v-model="authorityForm.accountId"
            :placeholder="t('Example I105 Account ID')"
          />
        </label>
        <label>
          {{ t("Authority Private Key (hex)") }}
          <textarea v-model="authorityForm.privateKeyHex" rows="2"></textarea>
        </label>
        <label>
          {{ t("Account Metadata (JSON)") }}
          <textarea
            v-model="metadataInput"
            rows="4"
            :placeholder="metadataPlaceholder"
          ></textarea>
        </label>
      </div>
      <div class="actions">
        <button :disabled="registering || !canRegister" @click="handleRegister">
          {{ registering ? t("Submitting…") : t("Create on-chain account") }}
        </button>
        <button class="secondary" @click="saveAuthority">
          {{ t("Save authority") }}
        </button>
      </div>
      <p v-if="registerMessage" class="helper">{{ registerMessage }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { z } from "zod";
import { useAppI18n } from "@/composables/useAppI18n";
import { useSessionStore } from "@/stores/session";
import {
  deriveAccountAddress,
  derivePublicKey,
  generateKeyPair,
  pingTorii,
  registerAccount,
} from "@/services/iroha";
import { TAIRA_CHAIN_PRESET } from "@/constants/chains";

type PingState = "idle" | "ok" | "error";

const session = useSessionStore();
const { t } = useAppI18n();
const DEFAULT_DOMAIN_LABEL = "default";

const connectionForm = reactive({ ...session.connection });
const emptyAccount = () => ({
  displayName: "",
  domain: DEFAULT_DOMAIN_LABEL,
  accountId: "",
  i105AccountId: "",
  i105DefaultAccountId: "",
  publicKeyHex: "",
  privateKeyHex: "",
});
const userForm = reactive({
  ...emptyAccount(),
  ...(session.activeAccount ?? {}),
});
const authorityForm = reactive({ ...session.authority });
const metadataPlaceholder = '{\n  "label": "Main wallet"\n}';
const metadataInput = ref(
  JSON.stringify(
    { nickname: session.activeAccount?.displayName || "" },
    null,
    2,
  ),
);

const pingState = ref<PingState>("idle");
const pingMessage = ref("");
const pingLoading = ref(false);
const generating = ref(false);
const registering = ref(false);
const registerMessage = ref("");

watch(
  () => session.connection,
  (value) => {
    const isTaira =
      value.toriiUrl === TAIRA_CHAIN_PRESET.connection.toriiUrl &&
      value.chainId === TAIRA_CHAIN_PRESET.connection.chainId &&
      value.networkPrefix === TAIRA_CHAIN_PRESET.connection.networkPrefix;
    const nextConnection = isTaira
      ? { ...value }
      : { ...TAIRA_CHAIN_PRESET.connection };
    Object.assign(connectionForm, nextConnection);
    if (!isTaira) {
      session.updateConnection({ ...TAIRA_CHAIN_PRESET.connection });
      session.persistState();
    }
  },
  { deep: true, immediate: true },
);

watch(
  () => session.activeAccount,
  (value) => Object.assign(userForm, { ...emptyAccount(), ...(value ?? {}) }),
  { deep: true },
);

watch(
  () => session.activeAccountId,
  () => {
    metadataInput.value = JSON.stringify(
      { nickname: session.activeAccount?.displayName || "" },
      null,
      2,
    );
  },
);

watch(
  () => session.authority,
  (value) => Object.assign(authorityForm, value),
  { deep: true },
);

watch(
  () => [userForm.domain, userForm.publicKeyHex],
  () => {
    if (!userForm.publicKeyHex || !userForm.domain) return;
    try {
      const summary = deriveAccountAddress({
        domain: userForm.domain,
        publicKeyHex: userForm.publicKeyHex,
        networkPrefix: connectionForm.networkPrefix,
      });
      Object.assign(userForm, summary);
    } catch (error) {
      console.warn("Failed to derive address", error);
    }
  },
  { deep: true },
);

const pingIndicator = computed(() => {
  switch (pingState.value) {
    case "ok":
      return { label: t("Healthy"), class: "status-pill ok" };
    case "error":
      return { label: t("Offline"), class: "status-pill error" };
    default:
      return { label: t("Idle"), class: "status-pill" };
  }
});

const canRegister = computed(() =>
  Boolean(
    connectionForm.toriiUrl &&
      connectionForm.chainId &&
      userForm.accountId &&
      authorityForm.accountId &&
      authorityForm.privateKeyHex,
  ),
);

const metadataSchema = z.record(z.any()).catch(() => ({}));

const saveConnection = () => {
  const nextConnection = {
    toriiUrl: TAIRA_CHAIN_PRESET.connection.toriiUrl,
    chainId: TAIRA_CHAIN_PRESET.connection.chainId,
    networkPrefix: TAIRA_CHAIN_PRESET.connection.networkPrefix,
    assetDefinitionId:
      connectionForm.assetDefinitionId ||
      TAIRA_CHAIN_PRESET.connection.assetDefinitionId,
  };
  Object.assign(connectionForm, nextConnection);
  session.updateConnection(nextConnection);
  session.persistState();
};

const saveUser = () => {
  session.updateActiveAccount({ ...userForm });
  session.persistState();
};

const saveAuthority = () => {
  session.updateAuthority({ ...authorityForm });
  session.persistState();
};

const handlePing = async () => {
  pingLoading.value = true;
  pingMessage.value = "";
  try {
    const result = await pingTorii(connectionForm.toriiUrl);
    pingState.value = result ? "ok" : "error";
    pingMessage.value = result
      ? t("Torii responded successfully.")
      : t("No response from Torii.");
  } catch (error) {
    pingState.value = "error";
    pingMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    pingLoading.value = false;
  }
};

const handleGenerate = async () => {
  generating.value = true;
  try {
    const pair = await generateKeyPair();
    userForm.privateKeyHex = pair.privateKeyHex;
    userForm.publicKeyHex = pair.publicKeyHex;
    if (!userForm.domain) {
      userForm.domain = DEFAULT_DOMAIN_LABEL;
    }
    const summary = deriveAccountAddress({
      domain: userForm.domain,
      publicKeyHex: pair.publicKeyHex,
      networkPrefix: connectionForm.networkPrefix,
    });
    Object.assign(userForm, summary);
    saveUser();
  } finally {
    generating.value = false;
  }
};

const handleDerivePublic = () => {
  if (!userForm.privateKeyHex) return;
  try {
    const derived = derivePublicKey(userForm.privateKeyHex);
    userForm.publicKeyHex = derived.publicKeyHex;
    const summary = deriveAccountAddress({
      domain: userForm.domain || DEFAULT_DOMAIN_LABEL,
      publicKeyHex: derived.publicKeyHex,
      networkPrefix: connectionForm.networkPrefix,
    });
    Object.assign(userForm, summary);
  } catch (error) {
    registerMessage.value =
      error instanceof Error ? error.message : String(error);
  }
};

const handleRegister = async () => {
  if (!canRegister.value) return;
  registering.value = true;
  registerMessage.value = "";
  try {
    const metadata = metadataSchema.parse(
      JSON.parse(metadataInput.value || "{}"),
    );
    const result = await registerAccount({
      toriiUrl: connectionForm.toriiUrl,
      chainId: connectionForm.chainId,
      accountId: userForm.accountId,
      domainId: userForm.domain,
      metadata,
      authorityAccountId: authorityForm.accountId,
      authorityPrivateKeyHex: authorityForm.privateKeyHex,
    });
    session.updateActiveAccount({ ...userForm });
    session.persistState();
    registerMessage.value = t("Submitted transaction {hash}", {
      hash: result.hash,
    });
  } catch (error) {
    registerMessage.value =
      error instanceof Error ? error.message : String(error);
  } finally {
    registering.value = false;
  }
};
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.helper {
  margin-top: 12px;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
}

.chain-picker {
  margin-bottom: 12px;
  display: grid;
  gap: 10px;
}

.preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.preset-chip {
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  padding: 10px 12px;
  min-width: 140px;
  text-align: start;
  display: grid;
  gap: 2px;
  cursor: pointer;
  color: inherit;
}

.preset-chip.active {
  border-color: var(--iroha-accent);
  box-shadow: 0 8px 24px rgba(255, 76, 102, 0.24);
}

.preset-chip.fixed {
  cursor: default;
}

.chip-title {
  font-weight: 700;
}

.chip-sub {
  font-size: 0.82rem;
  color: var(--iroha-muted);
}
</style>
