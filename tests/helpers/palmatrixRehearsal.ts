const ALLOWED_STEPS = new Set([
  "pair",
  "buy",
  "subscribe",
  "loan",
  "repay",
  "accelerated",
  "claim",
  "redeem",
]);

/** Reject incomplete plans so an opt-in rehearsal cannot silently skip its claims. */
export const palmatrixRehearsalSteps = (input: string): Set<string> => {
  const steps = new Set(
    input
      .split(",")
      .map((step) => step.trim())
      .filter(Boolean),
  );
  for (const step of steps) {
    if (!ALLOWED_STEPS.has(step))
      throw new Error(`Unknown PALMATRIX_STEPS entry: ${step}`);
  }
  for (const [step, prerequisite] of [
    ["loan", "buy"],
    ["repay", "loan"],
    ["claim", "accelerated"],
    ["redeem", "claim"],
  ]) {
    if (steps.has(step!) && !steps.has(prerequisite!))
      throw new Error(`PALMATRIX_STEPS ${step} requires ${prerequisite}`);
  }
  return steps;
};

/** The demo's EUR balances use cents; convert exact native payment quantities. */
export const palmatrixPaymentCents = (amount: string): bigint => {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/u.exec(amount);
  if (!match) throw new Error("Invalid EUR entitlement quantity");
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
};
