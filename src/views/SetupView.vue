<template>
  <div
    class="card-grid"
    style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))"
  >
    <section class="card">
      <header class="card-header">
        <h2>Torii Connection</h2>
        <span class="status-pill" :class="pingIndicator.class">
          {{ pingIndicator.label }}
        </span>
      </header>
      <div class="chain-picker">
        <p class="helper">
          Quickly select a chain profile.
          <span v-if="selectedChainName" class="pill inline-pill"
            >Selected: {{ selectedChainName }}</span
          >
        </p>
        <div class="preset-row">
          <button
            v-for="preset in chainPresets"
            :key="preset.id"
            class="preset-chip"
            :class="{ active: selectedPresetId === preset.id }"
            type="button"
            @click="applyPreset(preset)"
          >
            <span class="chip-title">{{ preset.label }}</span>
            <span class="chip-sub">{{ preset.description }}</span>
          </button>
          <button
            class="preset-chip outline"
            type="button"
            @click="showCustomChain = !showCustomChain"
          >
            <span class="chip-title">Custom chain</span>
            <span class="chip-sub">Add or pick your own</span>
          </button>
        </div>
        <div v-if="showCustomChain" class="custom-chain-panel">
          <div class="form-grid">
            <label>
              Label
              <input
                v-model.trim="customChainForm.label"
                placeholder="Local devnet"
              />
            </label>
            <label>
              Chain ID
              <input
                v-model.trim="customChainForm.chainId"
                placeholder="testus"
              />
            </label>
            <label>
              Torii URL
              <input
                v-model.trim="customChainForm.toriiUrl"
                placeholder="http://127.0.0.1:8080"
              />
            </label>
            <label>
              Asset Definition ID
              <input
                v-model.trim="customChainForm.assetDefinitionId"
                placeholder="rose#wonderland"
              />
            </label>
            <label>
              Network Prefix
              <input
                v-model.number="customChainForm.networkPrefix"
                type="number"
                min="0"
                max="255"
              />
            </label>
          </div>
          <div class="actions">
            <button @click="saveCustomChain">Save & apply</button>
            <button
              class="secondary"
              type="button"
              @click="showCustomChain = false"
            >
              Close
            </button>
          </div>
          <p v-if="customChainMessage" class="helper">
            {{ customChainMessage }}
          </p>
        </div>
        <div v-if="session.customChains.length" class="custom-chain-list">
          <p class="helper">Saved custom chains</p>
          <div class="chain-list-grid">
            <article
              v-for="chain in session.customChains"
              :key="chain.id"
              class="chain-card"
            >
              <div>
                <p class="chain-label">
                  {{ chain.label }}
                  <span v-if="selectedPresetId === chain.id" class="pill mini"
                    >Active</span
                  >
                </p>
                <p class="helper monospace">{{ chain.chainId }}</p>
              </div>
              <div class="chain-actions">
                <button
                  class="secondary"
                  type="button"
                  @click="applyCustomChain(chain)"
                >
                  Use
                </button>
                <button
                  class="ghost"
                  type="button"
                  @click="removeCustomChain(chain.id)"
                >
                  Remove
                </button>
              </div>
            </article>
          </div>
        </div>
      </div>
      <div class="form-grid">
        <label>
          Torii URL
          <input
            v-model="connectionForm.toriiUrl"
            placeholder="http://127.0.0.1:8080"
          />
        </label>
        <label>
          Chain ID
          <input v-model="connectionForm.chainId" placeholder="dev-chain" />
        </label>
        <label>
          Asset Definition ID
          <input
            v-model="connectionForm.assetDefinitionId"
            placeholder="rose#wonderland"
          />
        </label>
        <label>
          Network Prefix
          <input
            v-model.number="connectionForm.networkPrefix"
            type="number"
            min="0"
            max="255"
          />
        </label>
      </div>
      <div class="actions">
        <button :disabled="pingLoading" @click="handlePing">
          Check health
        </button>
        <button class="secondary" @click="saveConnection">Save</button>
      </div>
      <p v-if="pingMessage" class="helper">{{ pingMessage }}</p>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Key Material</h2>
      </header>
      <div class="form-grid">
        <label>
          Display Name
          <input v-model="userForm.displayName" placeholder="Alice" />
        </label>
        <label>
          Domain
          <input v-model="userForm.domain" placeholder="wonderland" />
        </label>
        <label>
          Private Key (hex)
          <textarea
            v-model="userForm.privateKeyHex"
            rows="2"
            placeholder="64 hex chars"
          ></textarea>
        </label>
        <label>
          Public Key
          <textarea
            v-model="userForm.publicKeyHex"
            rows="2"
            placeholder="auto-derived"
            readonly
          ></textarea>
        </label>
        <label>
          Account ID
          <input v-model="userForm.accountId" readonly />
        </label>
        <div class="grid-2">
          <div class="kv">
            <span class="kv-label">IH58</span>
            <span class="kv-value">{{ userForm.ih58 || "—" }}</span>
          </div>
          <div class="kv">
            <span class="kv-label">Compressed</span>
            <span class="kv-value">{{ userForm.compressed || "—" }}</span>
          </div>
        </div>
      </div>
      <div class="actions">
        <button :disabled="generating" @click="handleGenerate">
          Generate pair
        </button>
        <button
          class="secondary"
          :disabled="!userForm.privateKeyHex"
          @click="handleDerivePublic"
        >
          Derive from private key
        </button>
        <button class="secondary" @click="saveUser">Save identity</button>
      </div>
    </section>

    <section class="card">
      <header class="card-header">
        <h2>Register Account</h2>
        <p class="helper">
          Requires authority credentials — Torii receives a direct Norito
          transaction.
        </p>
      </header>
      <div class="form-grid">
        <label>
          Authority Account ID
          <input
            v-model="authorityForm.accountId"
            placeholder="34m... or 0x...@wonderland"
          />
        </label>
        <label>
          Authority Private Key (hex)
          <textarea v-model="authorityForm.privateKeyHex" rows="2"></textarea>
        </label>
        <label>
          Account Metadata (JSON)
          <textarea
            v-model="metadataInput"
            rows="4"
            :placeholder="metadataPlaceholder"
          ></textarea>
        </label>
      </div>
      <div class="actions">
        <button :disabled="registering || !canRegister" @click="handleRegister">
          {{ registering ? "Submitting…" : "Register account" }}
        </button>
        <button class="secondary" @click="saveAuthority">Save authority</button>
      </div>
      <p v-if="registerMessage" class="helper">{{ registerMessage }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { z } from "zod";
import { useSessionStore } from "@/stores/session";
import type { SavedChain } from "@/stores/session";
import {
  deriveAccountAddress,
  derivePublicKey,
  generateKeyPair,
  pingTorii,
  registerAccount,
} from "@/services/iroha";
import { CHAIN_PRESETS } from "@/constants/chains";
import type { ChainPreset } from "@/constants/chains";

type PingState = "idle" | "ok" | "error";

const session = useSessionStore();

const connectionForm = reactive({ ...session.connection });
const chainPresets: ChainPreset[] = CHAIN_PRESETS;
const selectedPresetId = ref<string | null>(null);
const selectedChainName = computed(() => {
  if (!selectedPresetId.value) return connectionForm.chainId || "";
  const preset = chainPresets.find(
    (item) => item.id === selectedPresetId.value,
  );
  if (preset) return preset.label;
  const custom = session.customChains.find(
    (item) => item.id === selectedPresetId.value,
  );
  return custom?.label || connectionForm.chainId;
});
const showCustomChain = ref(false);
const customChainForm = reactive({
  label: "",
  chainId: "",
  toriiUrl: "",
  assetDefinitionId: "",
  networkPrefix: connectionForm.networkPrefix,
});
const customChainMessage = ref("");
const emptyAccount = () => ({
  displayName: "",
  domain: "wonderland",
  accountId: "",
  publicKeyHex: "",
  privateKeyHex: "",
  ih58: "",
  compressed: "",
  compressedWarning: "",
});
const userForm = reactive({
  ...emptyAccount(),
  ...(session.activeAccount ?? {}),
});
const authorityForm = reactive({ ...session.authority });
const metadataPlaceholder = '{\n  "nickname": "Alice"\n}';
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
    Object.assign(connectionForm, value);
    const matchedPreset = chainPresets.find(
      (preset) =>
        preset.connection.chainId === value.chainId ||
        preset.connection.toriiUrl === value.toriiUrl ||
        preset.connection.assetDefinitionId === value.assetDefinitionId,
    );
    const matchedCustom = session.customChains.find(
      (chain) =>
        chain.chainId === value.chainId ||
        chain.toriiUrl === value.toriiUrl ||
        chain.assetDefinitionId === value.assetDefinitionId,
    );
    selectedPresetId.value = matchedPreset?.id ?? matchedCustom?.id ?? null;
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
      return { label: "Healthy", class: "status-pill ok" };
    case "error":
      return { label: "Offline", class: "status-pill error" };
    default:
      return { label: "Idle", class: "status-pill" };
  }
});

const applyPreset = (preset: ChainPreset) => {
  selectedPresetId.value = preset.id;
  Object.assign(connectionForm, { ...preset.connection });
  session.updateConnection({ ...preset.connection });
  session.persistState();
  showCustomChain.value = false;
};

const applyCustomChain = (chain: SavedChain) => {
  selectedPresetId.value = chain.id;
  Object.assign(connectionForm, {
    toriiUrl: chain.toriiUrl,
    chainId: chain.chainId,
    assetDefinitionId: chain.assetDefinitionId,
    networkPrefix: chain.networkPrefix,
  });
  session.updateConnection({ ...chain });
  session.persistState();
};

const saveCustomChain = () => {
  customChainMessage.value = "";
  try {
    session.addCustomChain({ ...customChainForm });
    session.persistState();
    const applied = session.customChains.find(
      (item) => item.chainId === customChainForm.chainId,
    );
    Object.assign(connectionForm, {
      toriiUrl: customChainForm.toriiUrl,
      chainId: customChainForm.chainId,
      assetDefinitionId: customChainForm.assetDefinitionId,
      networkPrefix: customChainForm.networkPrefix,
    });
    selectedPresetId.value = applied?.id ?? customChainForm.label;
    customChainMessage.value = "Saved and applied custom chain.";
    showCustomChain.value = false;
  } catch (error) {
    customChainMessage.value =
      error instanceof Error ? error.message : String(error);
  }
};

const removeCustomChain = (id: string) => {
  session.removeCustomChain(id);
  if (selectedPresetId.value === id) {
    selectedPresetId.value = null;
  }
  session.persistState();
};

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
  session.updateConnection({ ...connectionForm });
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
      ? "Torii responded successfully."
      : "No response from Torii.";
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
      userForm.domain = "wonderland";
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
      domain: userForm.domain || "wonderland",
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
      metadata,
      authorityAccountId: authorityForm.accountId,
      authorityPrivateKeyHex: authorityForm.privateKeyHex,
    });
    session.updateActiveAccount({ ...userForm });
    session.persistState();
    registerMessage.value = `Submitted transaction ${result.hash}`;
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
  text-align: left;
  display: grid;
  gap: 2px;
  cursor: pointer;
  color: inherit;
}

.preset-chip.active {
  border-color: var(--iroha-accent);
  box-shadow: 0 8px 24px rgba(255, 76, 102, 0.24);
}

.preset-chip.outline {
  border-style: dashed;
}

.chip-title {
  font-weight: 700;
}

.chip-sub {
  font-size: 0.82rem;
  color: var(--iroha-muted);
}

.custom-chain-panel {
  padding: 12px;
  border: 1px dashed var(--panel-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.custom-chain-list {
  display: grid;
  gap: 8px;
}

.chain-list-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
}

.chain-card {
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--panel-border);
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.chain-label {
  margin: 0 0 2px;
  font-weight: 700;
}

.chain-actions {
  display: flex;
  gap: 8px;
}
</style>
