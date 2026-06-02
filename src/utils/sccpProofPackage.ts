import {
  buildTronSccpBridgeProofSubmitPayload,
  buildTronSccpProofRequest,
  buildTronSccpSubmission,
  TronSccpProver,
  wrapTronSccpProofResult,
  type BinaryLike,
  type TronSccpBridgeProofSubmitPayloadInput,
  type TronSccpDestinationBindingInput,
  type TronSccpProofResult,
  type TronSccpProofRequestInput,
  type TronSccpProveFn,
  type TronSccpSubmission,
} from "@iroha/iroha-js/sccp";

export type SerializedSccpValue =
  | null
  | string
  | number
  | boolean
  | SerializedSccpValue[]
  | { [key: string]: SerializedSccpValue };

export type TronSccpProofPackageInput = {
  witness: TronSccpProofRequestInput;
  proofBytes?: BinaryLike;
  proofResult?: TronSccpProofResult;
  authority?: string;
  messageBundle?: Record<string, unknown>;
  destinationBinding?: TronSccpDestinationBindingInput;
};

export type TronSccpProofGenerationInput = TronSccpProofPackageInput & {
  prove?: TronSccpProveFn;
};

export type TronSccpProofPackage = {
  request: SerializedSccpValue;
  submission: SerializedSccpValue | null;
  bridgePayload: SerializedSccpValue | null;
};

const snapshotProofPackageInput = <T>(input: T, label: string): T => {
  try {
    return structuredClone(input);
  } catch (_error) {
    throw new Error(`${label} must be structured-cloneable.`);
  }
};

const bytesToHex = (bytes: Uint8Array): string =>
  `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

export const serializeSccpValue = (value: unknown): SerializedSccpValue => {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Uint8Array) {
    return bytesToHex(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => serializeSccpValue(entry));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        serializeSccpValue(entry),
      ]),
    );
  }
  return String(value);
};

export const buildTronSccpProofPackage = (
  input: TronSccpProofPackageInput,
): TronSccpProofPackage => {
  const request = buildTronSccpProofRequest(input.witness);
  if (input.proofResult) {
    if (input.proofResult.requestHash !== request.requestHash) {
      throw new Error("TRON SCCP proof result must match the proof request.");
    }
    const submission: TronSccpSubmission = buildTronSccpSubmission({
      proofResult: input.proofResult,
    });
    const bridgePayload =
      input.authority && input.messageBundle && input.destinationBinding
        ? buildTronSccpBridgeProofSubmitPayload({
            authority: input.authority,
            messageBundle: input.messageBundle,
            tronSccpSubmission: submission,
            destinationBinding: input.destinationBinding,
          } satisfies TronSccpBridgeProofSubmitPayloadInput)
        : null;

    return {
      request: serializeSccpValue(request),
      submission: serializeSccpValue(submission),
      bridgePayload: serializeSccpValue(bridgePayload),
    };
  }
  if (!input.proofBytes) {
    return {
      request: serializeSccpValue(request),
      submission: null,
      bridgePayload: null,
    };
  }

  const proofResult = wrapTronSccpProofResult(input.proofBytes, request);
  const submission: TronSccpSubmission = buildTronSccpSubmission({
    proofResult,
  });
  const bridgePayload =
    input.authority && input.messageBundle && input.destinationBinding
      ? buildTronSccpBridgeProofSubmitPayload({
          authority: input.authority,
          messageBundle: input.messageBundle,
          tronSccpSubmission: submission,
          destinationBinding: input.destinationBinding,
        } satisfies TronSccpBridgeProofSubmitPayloadInput)
      : null;

  return {
    request: serializeSccpValue(request),
    submission: serializeSccpValue(submission),
    bridgePayload: serializeSccpValue(bridgePayload),
  };
};

export const generateTronSccpProofPackage = async (
  input: TronSccpProofGenerationInput,
): Promise<TronSccpProofPackage> => {
  const { prove, ...packageInput } = input;
  if (typeof prove !== "function") {
    const error = new Error(
      "TRON SCCP Groth16 prover is not linked; provide a browser-safe prove function before generating production proofs.",
    );
    (error as Error & { code?: string }).code =
      "ERR_SCCP_TRON_PROVER_UNAVAILABLE";
    throw error;
  }
  const packageInputSnapshot = snapshotProofPackageInput(
    packageInput,
    "TRON SCCP proof package input",
  );
  const proverWitnessSnapshot = snapshotProofPackageInput(
    packageInputSnapshot.witness,
    "TRON SCCP proof witness",
  );
  const prover = new TronSccpProver({ prove });
  const proofResult = await prover.prove(proverWitnessSnapshot);
  return buildTronSccpProofPackage({
    ...packageInputSnapshot,
    proofResult,
  });
};
