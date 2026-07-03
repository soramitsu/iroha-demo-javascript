import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ToriiClient, privateKeyMultihash } from "@iroha/iroha-js";

const DEFAULT_TORII_URL = "https://taira.sora.org";
const DEFAULT_WALLET_FILE = "output/e2e/sccp-bsc-funded-sibling-wallet.json";
const DEFAULT_TEMPLATE_FILE =
  "../iroha/artifacts/sccp-taira/ivm-execution/taira-xor-burn-record-vk-register.template.json";
const DEFAULT_OUTPUT =
  "output/sccp-ton-testnet/taira-xor-burn-record-vk.register-live.json";
const DEFAULT_TIMEOUT_MS = 180_000;

const parseArgs = (argv) => {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = "true";
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const requireText = (value, label) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new Error(`${label} is required.`);
  }
  return text;
};

const sleep = (ms) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

const registerVerifyingKey = async ({ client, toriiUrl, payload }) => {
  try {
    await client.registerVerifyingKey(payload);
    return { method: "sdk" };
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !/missing field `public_inputs_schema_hash_hex`/u.test(error.message)
    ) {
      throw error;
    }
  }

  const livePayload = {
    ...payload,
    public_inputs_schema_hash_hex: payload.public_inputs_schema_hex,
  };
  delete livePayload.public_inputs_schema_hex;
  const response = await fetch(new URL("/v1/zk/vk/register", toriiUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(livePayload),
  });
  if (response.status !== 202) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `VK registration failed with HTTP ${response.status}: ${body.slice(0, 1000)}`,
    );
  }
  return { method: "direct-public-inputs-hash-field" };
};

const omitSecretFields = (value) => {
  if (Array.isArray(value)) {
    return value.map(omitSecretFields);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/private[_-]?key|secret|mnemonic|seed/iu.test(key)) {
      out[key] = "[redacted]";
    } else {
      out[key] = omitSecretFields(entry);
    }
  }
  return out;
};

const waitForVerifyingKey = async ({
  client,
  backend,
  name,
  commitmentHex,
  timeoutMs,
}) => {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const detail = await client.getVerifyingKey(backend, name);
      last = detail;
      const observedCommitment =
        typeof detail.commitment_hex === "string"
          ? detail.commitment_hex.toLowerCase()
          : typeof detail?.record?.commitment === "string"
            ? detail.record.commitment.toLowerCase()
            : "";
      if (
        !commitmentHex ||
        observedCommitment === commitmentHex.toLowerCase()
      ) {
        return detail;
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(2_000);
  }
  throw new Error(
    `Timed out waiting for ${backend}::${name}; last readback: ${JSON.stringify(last)}`,
  );
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const toriiUrl = args.torii || args["torii-url"] || DEFAULT_TORII_URL;
  const walletFile = resolve(args["wallet-file"] || DEFAULT_WALLET_FILE);
  const templateFile = resolve(
    args.template || args["template-file"] || DEFAULT_TEMPLATE_FILE,
  );
  const outputFile = resolve(args.output || DEFAULT_OUTPUT);
  const timeoutMs = Number(args["timeout-ms"] || DEFAULT_TIMEOUT_MS);

  const wallet = await readJson(walletFile);
  const template = await readJson(templateFile);
  const authority = requireText(wallet.accountId, "wallet accountId");
  const privateKeyHex = requireText(
    wallet.privateKeyHex,
    "wallet privateKeyHex",
  );
  const privateKey = `ed25519:${privateKeyMultihash(
    Buffer.from(privateKeyHex, "hex"),
    { algorithm: "ed25519" },
  )}`;
  const payload = {
    ...template,
    authority,
    private_key: privateKey,
  };

  const client = new ToriiClient(toriiUrl, { timeoutMs });
  const backend = requireText(payload.backend, "verifying key backend");
  const name = requireText(payload.name, "verifying key name");
  let registration = { method: "existing-readback" };
  let readback;
  try {
    readback = await waitForVerifyingKey({
      client,
      backend,
      name,
      commitmentHex: payload.commitment_hex,
      timeoutMs: 1_000,
    });
  } catch {
    registration = await registerVerifyingKey({ client, toriiUrl, payload });
    readback = await waitForVerifyingKey({
      client,
      backend,
      name,
      commitmentHex: payload.commitment_hex,
      timeoutMs,
    });
  }

  const result = {
    toriiUrl,
    authority,
    backend: payload.backend,
    name: payload.name,
    version: payload.version,
    circuit_id: payload.circuit_id,
    gas_schedule_id: payload.gas_schedule_id,
    public_inputs_schema_hex: payload.public_inputs_schema_hex,
    commitment_hex: payload.commitment_hex,
    vk_len: payload.vk_len,
    max_proof_bytes: payload.max_proof_bytes,
    status: readback?.status || readback?.record?.status,
    registration,
    readback: omitSecretFields(readback),
    registeredAt: new Date().toISOString(),
  };
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        backend: result.backend,
        name: result.name,
        commitment_hex: result.commitment_hex,
        status: result.status,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});
