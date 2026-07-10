export function parseTairaMcpJsonRpcResponseText(text) {
  const raw = String(text ?? "");
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }

  const eventPayloads = [];
  let currentDataLines = [];
  const flushEvent = () => {
    if (!currentDataLines.length) {
      return;
    }
    const payload = currentDataLines.join("\n").trim();
    currentDataLines = [];
    if (!payload || payload === "[DONE]") {
      return;
    }
    eventPayloads.push(payload);
  };

  for (const line of raw.split(/\r?\n/u)) {
    if (line === "") {
      flushEvent();
      continue;
    }
    if (line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("data:")) {
      currentDataLines.push(line.slice(5).trimStart());
    }
  }
  flushEvent();

  if (!eventPayloads.length) {
    throw new Error("MCP response was neither JSON nor SSE data.");
  }
  let lastPayload = null;
  for (const payload of eventPayloads) {
    lastPayload = JSON.parse(payload);
  }
  return lastPayload;
}
