import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  ToriiClient,
  compileKotodamaProgram,
  extractPipelineStatusKind,
  privateKeyMultihash,
} from "@iroha/iroha-js";

const DEFAULT_TORII_URL = "https://taira.sora.org";
const DEFAULT_WALLET_FILE = "output/e2e/sccp-bsc-funded-sibling-wallet.json";
const DEFAULT_CONTRACT_SOURCE =
  "../iroha/contracts/taira/sccp/TairaXorSccpInboundSettlement.ko";
const DEFAULT_CONTRACT_ALIAS = "taira_ton_xor_burn_record::universal";
const DEFAULT_OUTPUT =
  "output/sccp-ton-testnet/taira-ton-inbound-settlement.deploy-live.json";
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

const waitForTransaction = async ({ client, txHashHex, timeoutMs }) => {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const status = await client.getTransactionStatus(txHashHex);
      last = status;
      const kind = extractPipelineStatusKind(status);
      if (kind === "Applied" || kind === "Committed") {
        return status;
      }
      if (
        kind === "Rejected" ||
        kind === "Expired" ||
        kind === "Invalid" ||
        kind === "Dropped"
      ) {
        throw new Error(
          `transaction ${txHashHex} failed with status ${JSON.stringify(status)}`,
        );
      }
    } catch (error) {
      if (error instanceof Error && /failed with status/u.test(error.message)) {
        throw error;
      }
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(2_000);
  }
  throw new Error(
    `Timed out waiting for ${txHashHex}; last status: ${JSON.stringify(last)}`,
  );
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const toriiUrl = args.torii || args["torii-url"] || DEFAULT_TORII_URL;
  const walletFile = resolve(args["wallet-file"] || DEFAULT_WALLET_FILE);
  const sourceFile = resolve(
    args["contract-source"] || DEFAULT_CONTRACT_SOURCE,
  );
  const contractAlias = requireText(
    args["contract-alias"] || DEFAULT_CONTRACT_ALIAS,
    "contract alias",
  );
  const outputFile = resolve(args.output || DEFAULT_OUTPUT);
  const timeoutMs = Number(args["timeout-ms"] || DEFAULT_TIMEOUT_MS);

  const wallet = await readJson(walletFile);
  const authority = requireText(wallet.accountId, "wallet accountId");
  const privateKeyHex = requireText(
    wallet.privateKeyHex,
    "wallet privateKeyHex",
  );
  const privateKey = `ed25519:${privateKeyMultihash(
    Buffer.from(privateKeyHex, "hex"),
    { algorithm: "ed25519" },
  )}`;
  const source = await readFile(sourceFile, "utf8");
  const compiled = compileKotodamaProgram(source, {
    sourceName: sourceFile,
  });
  if (compiled.diagnostics.length > 0) {
    throw new Error(
      compiled.diagnostics
        .map((entry) => `${entry.severity}: ${entry.message}`)
        .join("\n"),
    );
  }
  const entrypoint = compiled.manifest?.entrypoints.find(
    (candidate) => candidate.name === "finalize_inbound",
  );
  if (entrypoint?.permission !== "AssetManager") {
    throw new Error(
      "Compiled settlement ABI is missing AssetManager finalize_inbound.",
    );
  }

  const client = new ToriiClient(toriiUrl, { timeoutMs });
  const response = await client.deployContract({
    authority,
    privateKey,
    contractAlias,
    codeB64: Buffer.from(compiled.artifactBytes),
  });
  const contract = response?.contracts?.find(
    (candidate) => candidate.contract_alias === contractAlias,
  );
  const txHashHex = requireText(
    contract?.tx_hash_hex || response?.operation_receipt?.tx_hash_hex,
    "deploy transaction hash",
  );
  const finalStatus = await waitForTransaction({
    client,
    txHashHex,
    timeoutMs,
  });
  const result = {
    contract_alias: contract?.contract_alias || contractAlias,
    contract_address:
      contract?.contract_address ||
      response?.operation_receipt?.contract_address,
    code_hash_hex: contract?.code_hash_hex || compiled.codeHashHex,
    abi_hash_hex: contract?.abi_hash_hex || compiled.abiHashHex,
    tx_hash_hex: txHashHex,
    status: finalStatus,
    response,
    deployedAt: new Date().toISOString(),
  };
  await mkdir(dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      {
        contract_alias: result.contract_alias,
        contract_address: result.contract_address,
        code_hash_hex: result.code_hash_hex,
        abi_hash_hex: result.abi_hash_hex,
        tx_hash_hex: result.tx_hash_hex,
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
