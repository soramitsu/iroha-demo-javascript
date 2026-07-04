export const proveSolanaSccpDestination = async () => {
  throw new Error(
    "Solana SCCP destination prover is not bundled in this build. Publish the governed Solana proof package before enabling taira_sol_xor.",
  );
};

export const solanaSccpDestinationProverSelfTest = async () => ({
  ready: false,
  reason:
    "Solana SCCP destination prover package is intentionally fail-closed until governed proof artifacts are published.",
});
