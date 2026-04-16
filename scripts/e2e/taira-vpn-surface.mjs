#!/usr/bin/env node

import {
  buildToriiSurfaceProbeUrls,
  buildToriiMcpToolsListRequest,
  findMissingToriiVpnMcpTools,
  findMissingToriiVpnOpenApiPaths,
  formatSurfaceProbeAttempt,
} from "./electron-live-utils.mjs";

const tairaToriiUrl = "https://taira.sora.org";
const toriiUrl =
  String(process.env.E2E_TORII_URL ?? tairaToriiUrl).trim() || tairaToriiUrl;

async function main() {
  const { healthUrls, mcpUrl, openApiUrl, vpnProfileUrl } =
    buildToriiSurfaceProbeUrls(toriiUrl);
  await preflightHealth(healthUrls);
  const failures = [];

  const mcpCapabilities = await probeJson(
    mcpUrl,
    "TAIRA MCP surface",
    failures,
  );
  const openApi = await probeJson(openApiUrl, "TAIRA OpenAPI", failures);
  const mcpToolList = await probeJsonPost(
    mcpUrl,
    buildToriiMcpToolsListRequest(),
    "TAIRA MCP tool registry",
    failures,
  );
  await probeJson(vpnProfileUrl, "TAIRA VPN profile", failures);

  if (mcpCapabilities) {
    const protocolVersion = String(
      mcpCapabilities.protocolVersion ?? "",
    ).trim();
    if (!protocolVersion) {
      failures.push(
        "TAIRA MCP surface is missing a `protocolVersion` in the capabilities response.",
      );
    }
  }

  if (openApi) {
    const missingPaths = findMissingToriiVpnOpenApiPaths(openApi);
    if (missingPaths.length) {
      failures.push(
        `TAIRA OpenAPI is missing VPN paths: ${missingPaths.join(", ")}`,
      );
    }
  }

  if (mcpToolList) {
    const missingTools = findMissingToriiVpnMcpTools(mcpToolList);
    if (missingTools.length) {
      failures.push(
        `TAIRA MCP tool registry is missing VPN tools: ${missingTools.join(", ")}`,
      );
    }
  }

  if (failures.length) {
    throw new Error(`TAIRA VPN surface is incomplete. ${failures.join(" | ")}`);
  }

  console.log(
    `TAIRA VPN surface verified: health ok, MCP ok, OpenAPI ok, tool registry ok, VPN profile ok at ${toriiUrl}.`,
  );
}

async function preflightHealth(healthUrls) {
  const attempts = [];
  for (const healthUrl of healthUrls) {
    const timeout = AbortSignal.timeout(15_000);
    try {
      const response = await fetch(healthUrl, {
        method: "GET",
        signal: timeout,
      });
      if (response.ok) {
        return;
      }
      const bodySnippet = await response.text().catch(() => "");
      attempts.push(
        formatSurfaceProbeAttempt(
          healthUrl,
          response.status,
          response.statusText,
          bodySnippet,
        ),
      );
    } catch (error) {
      attempts.push(`${healthUrl} -> ${String(error)}`);
    }
  }
  throw new Error(
    `TAIRA health preflight failed. Attempts: ${attempts.join(" | ")}`,
  );
}

async function probeJson(url, label, failures) {
  const timeout = AbortSignal.timeout(15_000);
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      signal: timeout,
    });
  } catch (error) {
    failures.push(`${label} request failed: ${url} -> ${String(error)}`);
    return null;
  }

  if (!response.ok) {
    const bodySnippet = await response.text().catch(() => "");
    failures.push(
      `${label} is unavailable. ${formatSurfaceProbeAttempt(
        url,
        response.status,
        response.statusText,
        bodySnippet,
      )}`,
    );
    return null;
  }

  const contentType = String(response.headers.get("content-type") ?? "").trim();
  if (!contentType.toLowerCase().includes("application/json")) {
    const bodySnippet = await response.text().catch(() => "");
    failures.push(
      `${label} did not return JSON. ${formatSurfaceProbeAttempt(
        url,
        response.status,
        response.statusText,
        bodySnippet,
      )}`,
    );
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    failures.push(`${label} returned invalid JSON: ${url} -> ${String(error)}`);
    return null;
  }
}

async function probeJsonPost(url, payload, label, failures) {
  const timeout = AbortSignal.timeout(15_000);
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: timeout,
    });
  } catch (error) {
    failures.push(`${label} request failed: ${url} -> ${String(error)}`);
    return null;
  }

  if (!response.ok) {
    const bodySnippet = await response.text().catch(() => "");
    failures.push(
      `${label} is unavailable. ${formatSurfaceProbeAttempt(
        url,
        response.status,
        response.statusText,
        bodySnippet,
      )}`,
    );
    return null;
  }

  const contentType = String(response.headers.get("content-type") ?? "").trim();
  if (!contentType.toLowerCase().includes("application/json")) {
    const bodySnippet = await response.text().catch(() => "");
    failures.push(
      `${label} did not return JSON. ${formatSurfaceProbeAttempt(
        url,
        response.status,
        response.statusText,
        bodySnippet,
      )}`,
    );
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    failures.push(`${label} returned invalid JSON: ${url} -> ${String(error)}`);
    return null;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
