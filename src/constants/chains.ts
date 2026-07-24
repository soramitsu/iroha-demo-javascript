import type { ConnectionConfig } from "@/stores/session";

export type ChainPreset = {
  id: string;
  label: string;
  description: string;
  connection: ConnectionConfig;
};

export const SORA_XOR_ASSET_DEFINITION_ID = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
export const MINAMOTO_CHAIN_ID = "00000000-0000-0000-0000-000000000000";
export const TAIRA_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";
export const TAIRA_NETWORK_PREFIX = 369;

export const TAIRA_CHAIN_PRESET: ChainPreset = {
  id: "taira-testnet",
  label: "TAIRA Testnet",
  description: "Public TAIRA testnet profile.",
  connection: {
    toriiUrl: "https://taira.sora.org",
    chainId: TAIRA_CHAIN_ID,
    assetDefinitionId: "",
    networkPrefix: TAIRA_NETWORK_PREFIX,
  },
};

export const MINAMOTO_CHAIN_PRESET: ChainPreset = {
  id: "minamoto-mainnet",
  label: "MINAMOTO Mainnet",
  description: "SORA Nexus mainnet profile.",
  connection: {
    toriiUrl: "https://minamoto.sora.org",
    chainId: MINAMOTO_CHAIN_ID,
    assetDefinitionId: SORA_XOR_ASSET_DEFINITION_ID,
    networkPrefix: 753,
  },
};

export const CHAIN_PRESETS: ChainPreset[] = [
  TAIRA_CHAIN_PRESET,
  MINAMOTO_CHAIN_PRESET,
];

const envString = (key: string): string | null => {
  const value = import.meta.env[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const envNumber = (key: string): number | null => {
  const value = envString(key);
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const defaultPresetId = envString("VITE_DEFAULT_CHAIN_PRESET");
const defaultPreset =
  CHAIN_PRESETS.find((preset) => preset.id === defaultPresetId) ??
  TAIRA_CHAIN_PRESET;

export const DEFAULT_CHAIN_PRESET: ChainPreset = {
  ...defaultPreset,
  connection: {
    ...defaultPreset.connection,
    toriiUrl:
      envString("VITE_DEFAULT_TORII_URL") ?? defaultPreset.connection.toriiUrl,
    chainId:
      envString("VITE_DEFAULT_CHAIN_ID") ?? defaultPreset.connection.chainId,
    assetDefinitionId:
      envString("VITE_DEFAULT_ASSET_DEFINITION_ID") ??
      defaultPreset.connection.assetDefinitionId,
    networkPrefix:
      envNumber("VITE_DEFAULT_NETWORK_PREFIX") ??
      defaultPreset.connection.networkPrefix,
  },
};

export const MINAMOTO_EXPLORER_URL = "https://minamoto-explorer.sora.org";
export const TAIRA_EXPLORER_URL = "https://taira-explorer.sora.org";
export const DEFAULT_EXPLORER_URL = TAIRA_EXPLORER_URL;
