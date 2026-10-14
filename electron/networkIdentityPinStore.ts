import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { normalizeEndpointUrl } from "../src/utils/endpoint";
import {
  TAIRA_CHAIN_ID,
  TAIRA_TORII_URL,
  isTairaTestnetEndpoint,
} from "../src/utils/firstReleaseNetworkIdentity";
import {
  NETWORK_IDENTITY_PIN_SCHEMA,
  isNetworkIdentityPin,
  pinMatchesIdentity,
  type NetworkIdentityPin,
  type ObservedNetworkIdentity,
} from "../src/utils/networkIdentity";

/** IPC channels served by the main process. */
export const NETWORK_IDENTITY_PIN_READ_CHANNEL = "network-identity:read-pin-v1";
export const NETWORK_IDENTITY_PIN_FIRST_USE_CHANNEL =
  "network-identity:pin-first-use-v1";
export const NETWORK_IDENTITY_CONFIRM_CHANGE_CHANNEL =
  "network-identity:confirm-change-v1";

const STORE_SCHEMA = "iroha.wallet.network-identity-pins.v1";
const MAX_PINNED_ENDPOINTS = 64;
const MAX_STORE_BYTES = 64 * 1024;

type StoreFile = {
  schema: typeof STORE_SCHEMA;
  pins: NetworkIdentityPin[];
};

/**
 * Per-endpoint network identity trust. Official TAIRA follows verified resets;
 * other endpoints keep trust-on-first-use pins until explicit confirmation.
 *
 * The file only records public network identities, so it is a plain JSON file
 * under Electron `userData`. Any malformed content fails closed: the store
 * refuses to load and every endpoint stays unpinned (read-only) until the file
 * is removed or repaired, rather than silently re-pinning.
 */
export class NetworkIdentityPinStore {
  readonly #filePath: string;
  readonly #now: () => number;

  constructor(userDataPath: string, options: { now?: () => number } = {}) {
    this.#filePath = join(userDataPath, "network-identity-pins.json");
    this.#now = options.now ?? Date.now;
  }

  get filePath(): string {
    return this.#filePath;
  }

  read(toriiUrlInput: string): NetworkIdentityPin | null {
    const toriiUrl = normalizeEndpointUrl(toriiUrlInput);
    return this.#load().pins.find((pin) => pin.toriiUrl === toriiUrl) ?? null;
  }

  /** Accept a verified identity, refreshing only the official TAIRA testnet. */
  pinFirstUse(
    toriiUrlInput: string,
    identity: Pick<ObservedNetworkIdentity, "networkId" | "networkPrefix">,
  ): NetworkIdentityPin {
    const toriiUrl = normalizeEndpointUrl(toriiUrlInput);
    const store = this.#load();
    const existing = store.pins.find((pin) => pin.toriiUrl === toriiUrl);
    if (existing) {
      if (
        pinMatchesIdentity(existing, identity) ||
        !isTairaTestnetEndpoint(toriiUrl, identity.networkPrefix) ||
        existing.networkPrefix !== identity.networkPrefix
      ) {
        return existing;
      }
      const pin = this.#buildPin(toriiUrl, identity, "testnet-current");
      this.#save({
        ...store,
        pins: store.pins.map((entry) =>
          entry.toriiUrl === toriiUrl ? pin : entry,
        ),
      });
      return pin;
    }
    if (store.pins.length >= MAX_PINNED_ENDPOINTS) {
      throw new Error(
        "Too many endpoints have pinned network identities; remove unused endpoints first.",
      );
    }
    const pin = this.#buildPin(toriiUrl, identity, "first-use");
    this.#save({ ...store, pins: [...store.pins, pin] });
    return pin;
  }

  /** Replace an endpoint pin after explicit user confirmation. */
  replaceConfirmed(
    toriiUrlInput: string,
    identity: Pick<ObservedNetworkIdentity, "networkId" | "networkPrefix">,
  ): NetworkIdentityPin {
    const toriiUrl = normalizeEndpointUrl(toriiUrlInput);
    const store = this.#load();
    const existing = store.pins.find((pin) => pin.toriiUrl === toriiUrl);
    if (existing && pinMatchesIdentity(existing, identity)) {
      return existing;
    }
    const pin = this.#buildPin(toriiUrl, identity, "user-confirmed");
    this.#save({
      ...store,
      pins: [...store.pins.filter((entry) => entry.toriiUrl !== toriiUrl), pin],
    });
    return pin;
  }

  #buildPin(
    toriiUrl: string,
    identity: Pick<ObservedNetworkIdentity, "networkId" | "networkPrefix">,
    confirmation: NetworkIdentityPin["confirmation"],
  ): NetworkIdentityPin {
    const pin: NetworkIdentityPin = {
      schema: NETWORK_IDENTITY_PIN_SCHEMA,
      toriiUrl,
      networkId: identity.networkId,
      networkPrefix: identity.networkPrefix,
      confirmedAtMs: this.#now(),
      confirmation,
    };
    if (!isNetworkIdentityPin(pin)) {
      throw new Error("Refusing to persist a noncanonical network identity.");
    }
    return pin;
  }

  #load(): StoreFile {
    let raw: string;
    try {
      raw = readFileSync(this.#filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        return { schema: STORE_SCHEMA, pins: [] };
      }
      throw error;
    }
    if (Buffer.byteLength(raw, "utf8") > MAX_STORE_BYTES) {
      throw new Error("Network identity pin store exceeds its size limit.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Network identity pin store is not valid JSON.");
    }
    const record =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    if (
      !record ||
      record.schema !== STORE_SCHEMA ||
      !Array.isArray(record.pins) ||
      Object.keys(record).length !== 2 ||
      record.pins.length > MAX_PINNED_ENDPOINTS ||
      !record.pins.every(isNetworkIdentityPin) ||
      new Set(record.pins.map((pin) => (pin as NetworkIdentityPin).toriiUrl))
        .size !== record.pins.length
    ) {
      throw new Error(
        `Network identity pin store at ${this.#filePath} is malformed; remove it to re-pin endpoints.`,
      );
    }
    return { schema: STORE_SCHEMA, pins: record.pins as NetworkIdentityPin[] };
  }

  #save(store: StoreFile) {
    const serialized = `${JSON.stringify(store, null, 2)}\n`;
    mkdirSync(dirname(this.#filePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.#filePath}.${process.pid}.tmp`;
    try {
      writeFileSync(temporaryPath, serialized, { mode: 0o600, flag: "w" });
      renameSync(temporaryPath, this.#filePath);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  }
}

/**
 * Resolve the pinned NetworkId for main-process signers (VPN canonical auth).
 * The endpoint must currently report the pinned identity through both public
 * sources. Official TAIRA resets are accepted automatically; other changed
 * identities require confirmation.
 */
export const resolvePinnedNetworkIdInMain = async (
  store: NetworkIdentityPinStore,
  input: { toriiUrl: string; chainId: string; networkPrefix: number },
  discover: (
    toriiUrl: string,
  ) => Promise<
    | { status: "verified"; identity: ObservedNetworkIdentity }
    | { status: "conflicting" | "incomplete" | "unreachable"; detail: string }
  >,
): Promise<string> => {
  const toriiUrl = normalizeEndpointUrl(input.toriiUrl);
  if (toriiUrl === TAIRA_TORII_URL && input.chainId !== TAIRA_CHAIN_ID) {
    throw new Error(
      "The configured chain ID does not match the TAIRA testnet.",
    );
  }
  if (
    toriiUrl === TAIRA_TORII_URL &&
    !isTairaTestnetEndpoint(toriiUrl, input.networkPrefix)
  ) {
    throw new Error(
      "The configured network prefix does not match the TAIRA testnet.",
    );
  }
  const discovery = await discover(toriiUrl);
  if (discovery.status !== "verified") {
    throw new Error(
      `Endpoint network identity is not verified: ${discovery.detail}`,
    );
  }
  if (discovery.identity.networkPrefix !== input.networkPrefix) {
    throw new Error(
      `Endpoint network prefix ${discovery.identity.networkPrefix} differs from the configured prefix ${input.networkPrefix}.`,
    );
  }
  const pin = store.pinFirstUse(toriiUrl, discovery.identity);
  if (!pinMatchesIdentity(pin, discovery.identity)) {
    throw new Error(
      `This endpoint now reports network ${discovery.identity.networkId}, but this wallet trusted ${pin.networkId}. Confirm the new network identity in Settings first.`,
    );
  }
  return pin.networkId;
};
