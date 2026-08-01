const parseJsonStringToken = (text, start) => {
  let index = start + 1;
  while (index < text.length) {
    const character = text[index];
    if (character === '"') {
      return {
        value: JSON.parse(text.slice(start, index + 1)),
        end: index,
      };
    }
    if (character === "\\") {
      index += 2;
      continue;
    }
    index += 1;
  }
  return null;
};

const nextNonWhitespaceIndex = (text, start) => {
  let index = start;
  while (index < text.length && /\s/u.test(text[index])) index += 1;
  return index;
};

const duplicateJsonObjectKey = (text) => {
  const stack = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      const token = parseJsonStringToken(text, index);
      if (!token) return null;
      const current = stack.at(-1);
      if (
        current?.type === "object" &&
        current.expectingKey === true &&
        text[nextNonWhitespaceIndex(text, token.end + 1)] === ":"
      ) {
        if (current.keys.has(token.value)) return token.value;
        current.keys.add(token.value);
        current.expectingKey = false;
      }
      index = token.end;
      continue;
    }
    if (character === "{") {
      stack.push({ type: "object", keys: new Set(), expectingKey: true });
      continue;
    }
    if (character === "[") {
      stack.push({ type: "array" });
      continue;
    }
    if (character === "}" || character === "]") {
      stack.pop();
      continue;
    }
    if (character === ",") {
      const current = stack.at(-1);
      if (current?.type === "object") current.expectingKey = true;
    }
  }
  return null;
};

/**
 * Parse JSON without JSON.parse's last-key-wins ambiguity. The caller is
 * responsible for obtaining `text` through a fatal UTF-8 decoder.
 */
export const parseSolanaGovernanceDuplicateFreeJsonText = (text, label) => {
  if (typeof text !== "string") {
    throw new TypeError(`${label} must be supplied as decoded JSON text.`);
  }
  try {
    const duplicateKey = duplicateJsonObjectKey(text);
    if (duplicateKey !== null) {
      throw new SyntaxError(
        `${label} contains a duplicate JSON object key (${JSON.stringify(duplicateKey)}).`,
      );
    }
    return JSON.parse(text);
  } catch (cause) {
    throw new Error(`${label} must contain duplicate-free JSON.`, { cause });
  }
};

const assertUnicodeScalarString = (value) => {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new SyntaxError("JSON contains an unpaired Unicode surrogate.");
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new SyntaxError("JSON contains an unpaired Unicode surrogate.");
    }
  }
};

const assertUnambiguousJsonValue = (value) => {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new SyntaxError("JSON numbers must be safe integers.");
    }
    return;
  }
  if (typeof value === "string") {
    assertUnicodeScalarString(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) assertUnambiguousJsonValue(entry);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertUnicodeScalarString(key);
      assertUnambiguousJsonValue(entry);
    }
  }
};

const deterministicJsonEncodings = (value, suffixes) => {
  const compact = JSON.stringify(value);
  const pretty = JSON.stringify(value, null, 2);
  return new Set(
    suffixes.flatMap((suffix) => [`${compact}${suffix}`, `${pretty}${suffix}`]),
  );
};

/** Deterministic parser for governance JSON received over an HTTP response. */
export const parseSolanaGovernanceDeterministicJsonText = (text, label) => {
  try {
    const value = parseSolanaGovernanceDuplicateFreeJsonText(text, label);
    assertUnambiguousJsonValue(value);
    if (!deterministicJsonEncodings(value, ["", "\n"]).has(text)) {
      throw new SyntaxError(
        "JSON text does not match a deterministic governance encoding.",
      );
    }
    return value;
  } catch (cause) {
    throw new Error(
      `${label} must contain deterministic duplicate-free JSON.`,
      {
        cause,
      },
    );
  }
};

/**
 * Reviewed governance artifacts use one of the two encodings emitted by the
 * production writers: compact JSON or two-space pretty JSON, followed by one
 * LF. Requiring an exact round trip rejects BOMs, alternate number/string
 * spellings, trailing data, and whitespace variants even when a reviewer pin
 * was recomputed over those ambiguous bytes.
 */
export const parseSolanaGovernanceCanonicalJsonBytes = (bytes, label) => {
  try {
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError("JSON bytes must be a Uint8Array.");
    }
    const text = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(bytes);
    const value = parseSolanaGovernanceDuplicateFreeJsonText(text, label);
    assertUnambiguousJsonValue(value);
    if (!deterministicJsonEncodings(value, ["\n"]).has(text)) {
      throw new SyntaxError(
        "JSON bytes do not match a deterministic governance writer encoding.",
      );
    }
    return value;
  } catch (cause) {
    throw new Error(
      `${label} must contain canonical, duplicate-free UTF-8 JSON.`,
      { cause },
    );
  }
};
