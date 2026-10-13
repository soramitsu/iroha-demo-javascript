/** Main -> renderer notification that an `iroha://connect` link is waiting. */
export const IROHA_CONNECT_DEEP_LINK_AVAILABLE_CHANNEL =
  "iroha-connect:deep-link-available-v1";
/** Renderer (via preload) -> main: take and clear the pending pairing link. */
export const IROHA_CONNECT_TAKE_DEEP_LINK_CHANNEL =
  "iroha-connect:take-deep-link-v1";
/** DOM event preload dispatches on `window` when a pairing link is waiting. */
export const IROHA_CONNECT_DEEP_LINK_DOM_EVENT = "iroha-connect-deep-link";
