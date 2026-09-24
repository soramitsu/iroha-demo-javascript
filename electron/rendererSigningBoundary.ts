const RENDERER_SIGNING_SECRET_KEYS = new Set([
  "privateKeyHex",
  "authorityPrivateKeyHex",
]);

const MAX_RENDERER_SIGNING_BOUNDARY_OBJECTS = 10_000;
const MAX_RENDERER_SIGNING_BOUNDARY_DEPTH = 64;
const MAX_RENDERER_SIGNING_BOUNDARY_FIELDS_PER_CONTAINER = 512;
const MAX_RENDERER_SIGNING_BOUNDARY_TOTAL_FIELDS = 20_000;
const MAX_RENDERER_SIGNING_BOUNDARY_BINARY_BYTES = 64 * 1024;

const signingBoundaryComplexityError = () =>
  new Error(
    "Renderer bridge input exceeds the signing-boundary complexity limit.",
  );

const binaryByteLength = (value: object): number | null => {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
    return value.byteLength;
  }
  if (
    typeof SharedArrayBuffer !== "undefined" &&
    value instanceof SharedArrayBuffer
  ) {
    return value.byteLength;
  }
  return null;
};

const containsRendererSigningSecret = (
  value: unknown,
  seen: WeakSet<object>,
): boolean => {
  const pending: Array<Readonly<{ value: unknown; depth: number }>> = [
    { value, depth: 0 },
  ];
  let inspectedObjects = 0;
  let inspectedFields = 0;

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (
      current.value === null ||
      (typeof current.value !== "object" && typeof current.value !== "function")
    ) {
      continue;
    }
    const object = current.value as object;
    if (seen.has(object)) {
      continue;
    }
    seen.add(object);
    inspectedObjects += 1;
    if (
      inspectedObjects > MAX_RENDERER_SIGNING_BOUNDARY_OBJECTS ||
      current.depth > MAX_RENDERER_SIGNING_BOUNDARY_DEPTH
    ) {
      throw signingBoundaryComplexityError();
    }

    // `in` intentionally covers both inherited and non-enumerable secret
    // fields without requiring a complete own-property-name allocation.
    for (const key of RENDERER_SIGNING_SECRET_KEYS) {
      if (key in object) {
        return true;
      }
    }

    if (
      Array.isArray(object) &&
      object.length > MAX_RENDERER_SIGNING_BOUNDARY_FIELDS_PER_CONTAINER
    ) {
      throw signingBoundaryComplexityError();
    }
    const byteLength = binaryByteLength(object);
    if (
      byteLength !== null &&
      byteLength > MAX_RENDERER_SIGNING_BOUNDARY_BINARY_BYTES
    ) {
      throw signingBoundaryComplexityError();
    }

    let containerFields = 0;
    // Renderer DTO fields are enumerable data fields. Walk them incrementally
    // so a wide object/expando fails at the budget instead of first allocating
    // an attacker-sized array of every property name.
    for (const key in object) {
      containerFields += 1;
      inspectedFields += 1;
      if (
        containerFields > MAX_RENDERER_SIGNING_BOUNDARY_FIELDS_PER_CONTAINER ||
        inspectedFields > MAX_RENDERER_SIGNING_BOUNDARY_TOTAL_FIELDS
      ) {
        throw signingBoundaryComplexityError();
      }
      if (!Object.prototype.hasOwnProperty.call(object, key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      if (!descriptor || !("value" in descriptor)) {
        continue;
      }
      pending.push({ value: descriptor.value, depth: current.depth + 1 });
    }
  }
  return false;
};

export const assertNoRendererSigningSecret = (
  methodName: string,
  args: readonly unknown[],
): void => {
  if (containsRendererSigningSecret(args, new WeakSet())) {
    throw new Error(
      `${methodName} does not accept renderer-provided signing keys. Store the wallet secret in the Electron secure vault first.`,
    );
  }
};

export const wrapRendererSigningBoundary = <T extends object>(
  api: T,
  allowedSecretInputMethods: ReadonlySet<keyof T>,
): T => {
  const wrapped = {} as Record<PropertyKey, unknown>;
  for (const methodName of Object.keys(api) as Array<keyof T>) {
    const member = api[methodName];
    wrapped[methodName as PropertyKey] =
      typeof member === "function" && !allowedSecretInputMethods.has(methodName)
        ? (...args: unknown[]) => {
            assertNoRendererSigningSecret(String(methodName), args);
            return Reflect.apply(member, api, args);
          }
        : member;
  }
  return wrapped as T;
};
