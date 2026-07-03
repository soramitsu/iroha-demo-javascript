const unavailable = () => {
  throw new Error(
    "TON destination proof generation is served by the live TAIRA proof job for this testnet route.",
  );
};

export const proveTonSccpMessage = unavailable;
export const irohaSccpTonProve = unavailable;
export const tonSccpProve = unavailable;
