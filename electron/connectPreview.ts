import type { ConnectSessionResponse, ToriiClient } from "@iroha/iroha-js";
import {
  createConnectSessionPreview,
  type BrowserConnectSessionPreview,
  type BrowserConnectSessionPreviewOptions,
} from "@iroha/iroha-js/connect-browser";

const CONNECT_LAUNCH_PROTOCOL = "irohaconnect";

export type PortableConnectPreviewOptions = BrowserConnectSessionPreviewOptions;
export type PortableConnectPreview = BrowserConnectSessionPreview;

/**
 * Create and register one Connect session from the same exact identity tuple.
 *
 * NetworkId is the genesis-derived consensus identity, not the human-facing
 * chain UUID. The SDK derives the SID from NetworkId, the X25519 app public
 * key, and the nonce; all three values must then be sent back to Torii so it
 * can verify that commitment before allocating role tokens.
 */
export async function bootstrapPortableConnectPreviewSession(
  toriiClient: Pick<ToriiClient, "createConnectSession">,
  options: PortableConnectPreviewOptions,
): Promise<{
  preview: PortableConnectPreview;
  session: ConnectSessionResponse;
  tokens: {
    wallet: string;
    app: string;
    management: string;
    relay: string;
  };
}> {
  if (!toriiClient || typeof toriiClient.createConnectSession !== "function") {
    throw new TypeError("toriiClient must expose createConnectSession()");
  }

  const preview = createPortableConnectSessionPreview(options);
  const session = await toriiClient.createConnectSession({
    sid: preview.sidBase64Url,
    networkId: preview.networkId,
    appPublicKey: Uint8Array.from(preview.appKeyPair.publicKey),
    nonce: Uint8Array.from(preview.nonce),
    ...(preview.node === null ? {} : { node: preview.node }),
  });

  return {
    preview,
    session,
    tokens: {
      wallet: session.token_wallet,
      app: session.token_app,
      management: session.token_management,
      relay: session.token_relay,
    },
  };
}

export function createPortableConnectSessionPreview(
  options: PortableConnectPreviewOptions,
): PortableConnectPreview {
  return createConnectSessionPreview(options);
}

export function rewriteConnectUriProtocol(
  uri: string,
  protocol = CONNECT_LAUNCH_PROTOCOL,
) {
  const parsed = new URL(requireNonEmptyString(uri, "uri"));
  const normalized = requireNonEmptyString(protocol, "protocol");
  parsed.protocol = normalized.endsWith(":") ? normalized : `${normalized}:`;
  return parsed.toString();
}

export function resolvePortableConnectLaunchUri(
  canonicalSessionUri: string | null | undefined,
  previewUri: string | null | undefined,
  protocol = CONNECT_LAUNCH_PROTOCOL,
) {
  const selected = canonicalSessionUri ?? previewUri;
  if (!selected) {
    return null;
  }
  return rewriteConnectUriProtocol(selected, protocol);
}

function requireNonEmptyString(value: string, name: string) {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${name} must not be empty`);
  }
  return trimmed;
}
