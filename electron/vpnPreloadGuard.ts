export const VPN_PROFILE_UNAVAILABLE_MESSAGE =
  "VPN control plane is unavailable on this Torii node.";

export const runVpnConnectAfterProfileCheck = async <
  TSigningMaterial,
  TResult,
>(dependencies: {
  loadProfile: () => Promise<{ available?: unknown } | null | undefined>;
  resolveSigningMaterial: () => Promise<TSigningMaterial>;
  invokeController: (signingMaterial: TSigningMaterial) => Promise<TResult>;
}): Promise<TResult> => {
  const profile = await dependencies.loadProfile();
  if (profile?.available !== true) {
    throw new Error(VPN_PROFILE_UNAVAILABLE_MESSAGE);
  }
  const signingMaterial = await dependencies.resolveSigningMaterial();
  return dependencies.invokeController(signingMaterial);
};

export const runLocalVpnRepair = async <TResult>(dependencies: {
  invokeController: () => Promise<TResult>;
}): Promise<TResult> => dependencies.invokeController();

export const runVpnDisconnectWithLocalFallback = async <
  TAuthenticatedInput,
  TResult extends {
    reconcileState?: string | null;
    systemTunnelActive?: boolean;
  },
>(dependencies: {
  resolveAuthenticatedInput: () => Promise<TAuthenticatedInput>;
  invokeAuthenticatedController: (
    input: TAuthenticatedInput,
  ) => Promise<TResult>;
  invokeLocalController: () => Promise<TResult>;
}): Promise<TResult> => {
  let authenticatedInput: TAuthenticatedInput;
  try {
    authenticatedInput = await dependencies.resolveAuthenticatedInput();
  } catch {
    return dependencies.invokeLocalController();
  }

  const result =
    await dependencies.invokeAuthenticatedController(authenticatedInput);
  if (
    result.reconcileState === "active-session-context-mismatch" &&
    result.systemTunnelActive
  ) {
    return dependencies.invokeLocalController();
  }
  return result;
};
