import { pathToFileURL } from "node:url";

let sdkExports = new Map();

export const initialize = ({ exports: selectedExports }) => {
  if (!Array.isArray(selectedExports) || selectedExports.length === 0) {
    throw new Error(
      "The selected @iroha/iroha-js Node export map is unavailable.",
    );
  }
  sdkExports = new Map(selectedExports);
};

export const resolve = (specifier, context, nextResolve) => {
  const selectedPath = sdkExports.get(specifier);
  if (!selectedPath) {
    return nextResolve(specifier, context);
  }
  return {
    shortCircuit: true,
    url: pathToFileURL(selectedPath).href,
  };
};
