export const proveSolanaSccpSource = async () => {
  throw new Error(
    "Solana SCCP source prover is not bundled in this build. Publish the governed Solana source proof package before enabling Solana -> TAIRA settlement.",
  );
};

export const solanaSccpSourceProverSelfTest = async () => ({
  ready: false,
  reason:
    "Solana SCCP source prover package is intentionally fail-closed until governed proof artifacts are published.",
});
