type JsonContainerFrame =
  | {
      type: "object";
      keys: Set<string>;
      expectingKey: boolean;
    }
  | {
      type: "array";
    };

const parseJsonStringToken = (
  text: string,
  start: number,
): { value: string; end: number } | null => {
  let index = start + 1;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      return {
        value: JSON.parse(text.slice(start, index + 1)) as string,
        end: index,
      };
    }
    if (char === "\\") {
      index += 2;
      continue;
    }
    index += 1;
  }
  return null;
};

const nextNonWhitespaceIndex = (text: string, start: number): number => {
  let index = start;
  while (index < text.length && /\s/u.test(text[index] ?? "")) {
    index += 1;
  }
  return index;
};

const duplicateJsonObjectKeyReason = (text: string, label: string): string => {
  const stack: JsonContainerFrame[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      const token = parseJsonStringToken(text, index);
      if (!token) {
        return "";
      }
      const current = stack[stack.length - 1];
      if (
        current?.type === "object" &&
        current.expectingKey === true &&
        text[nextNonWhitespaceIndex(text, token.end + 1)] === ":"
      ) {
        if (current.keys.has(token.value)) {
          return `${label} contains a duplicate JSON object key.`;
        }
        current.keys.add(token.value);
        current.expectingKey = false;
      }
      index = token.end;
      continue;
    }
    if (char === "{") {
      stack.push({ type: "object", keys: new Set(), expectingKey: true });
      continue;
    }
    if (char === "[") {
      stack.push({ type: "array" });
      continue;
    }
    if (char === "}" || char === "]") {
      stack.pop();
      continue;
    }
    if (char === ",") {
      const current = stack[stack.length - 1];
      if (current?.type === "object") {
        current.expectingKey = true;
      }
    }
  }
  return "";
};

export const parseJsonWithoutDuplicateObjectKeys = (
  text: string,
  label: string,
): unknown => {
  const duplicateReason = duplicateJsonObjectKeyReason(text, label);
  if (duplicateReason) {
    throw new Error(duplicateReason);
  }
  return JSON.parse(text) as unknown;
};
