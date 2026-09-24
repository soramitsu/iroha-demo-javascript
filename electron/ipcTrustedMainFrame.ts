import { isTrustedRendererNavigationUrl } from "./rendererProtocol";

type IpcOwnerWindow = {
  isDestroyed(): boolean;
};

type IpcSenderFrame = {
  readonly url?: unknown;
};

export const assertTrustedMainFrameIpcSender = (input: {
  owner: IpcOwnerWindow | null;
  mainWindow: IpcOwnerWindow | null;
  senderFrame: IpcSenderFrame | null;
  mainFrame: object | null;
  trustedRendererUrl: string;
}): void => {
  if (
    !input.owner ||
    !input.mainWindow ||
    input.owner !== input.mainWindow ||
    input.owner.isDestroyed() ||
    !input.senderFrame ||
    input.senderFrame !== input.mainFrame ||
    !input.trustedRendererUrl ||
    typeof input.senderFrame.url !== "string" ||
    !isTrustedRendererNavigationUrl(
      input.senderFrame.url,
      input.trustedRendererUrl,
    )
  ) {
    throw new Error(
      "This IPC operation requires the trusted top-level wallet frame.",
    );
  }
};
