export const SCCP_DATA_SNAPSHOT_ERROR =
  "SCCP proof data must contain only enumerable string-keyed data properties with JSON-compatible values or binary proof bytes.";

type SnapshotOptions = {
  allowBinary: boolean;
  errorMessage: string;
};

const isPlainSccpDataRecord = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const isCanonicalArrayIndexKey = (key: string, length: number): boolean => {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(key)) {
    return false;
  }
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
};

const cloneBinarySccpDataValue = (value: object): unknown | null => {
  if (value instanceof ArrayBuffer) {
    return value.slice(0);
  }
  if (!ArrayBuffer.isView(value)) {
    return null;
  }
  const view = value as ArrayBufferView;
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength).slice();
};

export const snapshotSccpDataValue = <T>(value: T, label: string): T => {
  return snapshotSccpDataValueWithOptions(value, {
    allowBinary: true,
    errorMessage: `${label} ${SCCP_DATA_SNAPSHOT_ERROR}`,
  });
};

export const snapshotSccpJsonDataValue = <T>(
  value: T,
  errorMessage: string,
): T => {
  return snapshotSccpDataValueWithOptions(value, {
    allowBinary: false,
    errorMessage,
  });
};

const snapshotSccpDataValueWithOptions = <T>(
  value: T,
  options: SnapshotOptions,
  visiting = new WeakSet<object>(),
): T => {
  const cloneValue = (current: unknown): unknown => {
    if (current === null) {
      return null;
    }
    const currentType = typeof current;
    if (currentType !== "object") {
      if (
        currentType === "string" ||
        currentType === "boolean" ||
        (currentType === "number" && Number.isFinite(current))
      ) {
        return current;
      }
      throw new Error(options.errorMessage);
    }

    const objectValue = current as object;
    const binaryClone = options.allowBinary
      ? cloneBinarySccpDataValue(objectValue)
      : null;
    if (binaryClone) {
      return binaryClone;
    }
    if (visiting.has(objectValue)) {
      throw new Error(options.errorMessage);
    }
    visiting.add(objectValue);
    try {
      const descriptors = Object.getOwnPropertyDescriptors(objectValue);
      if (Array.isArray(objectValue)) {
        const clone: unknown[] = [];
        for (let index = 0; index < objectValue.length; index += 1) {
          if (
            !Object.prototype.hasOwnProperty.call(descriptors, String(index))
          ) {
            throw new Error(options.errorMessage);
          }
        }
        for (const key of Reflect.ownKeys(descriptors)) {
          if (key === "length") {
            continue;
          }
          if (
            typeof key !== "string" ||
            !isCanonicalArrayIndexKey(key, objectValue.length)
          ) {
            throw new Error(options.errorMessage);
          }
          const descriptor = descriptors[key];
          if (!descriptor.enumerable || !("value" in descriptor)) {
            throw new Error(options.errorMessage);
          }
          clone[Number(key)] = cloneValue(descriptor.value);
        }
        return clone;
      }

      if (!isPlainSccpDataRecord(objectValue)) {
        throw new Error(options.errorMessage);
      }
      const clone: Record<string, unknown> = {};
      for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== "string") {
          throw new Error(options.errorMessage);
        }
        const descriptor = descriptors[key];
        if (!descriptor.enumerable || !("value" in descriptor)) {
          throw new Error(options.errorMessage);
        }
        clone[key] = cloneValue(descriptor.value);
      }
      return clone;
    } finally {
      visiting.delete(objectValue);
    }
  };

  return cloneValue(value) as T;
};
