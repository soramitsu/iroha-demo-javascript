#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
IROHA_DIR="${E2E_IROHA_DIR:-$(cd "${PROJECT_ROOT}/../iroha" && pwd)}"
DEFAULT_TARGET_DIR="${IROHA_DIR}/target"
if [[ -d "${IROHA_DIR}/target_codex_iroha_demo" ]]; then
  DEFAULT_TARGET_DIR="${IROHA_DIR}/target_codex_iroha_demo"
fi
TARGET_DIR="${E2E_IROHA_TARGET_DIR:-${DEFAULT_TARGET_DIR}}"
PROFILE="${E2E_IROHA_PROFILE:-debug}"

KAGAMI_BIN="${E2E_KAGAMI_BIN:-${TARGET_DIR}/${PROFILE}/kagami}"
IROHAD_BIN="${E2E_IROHAD_BIN:-${TARGET_DIR}/${PROFILE}/irohad}"
OUT_DIR="${E2E_LOCALNET_OUT_DIR:-/tmp/iroha-localnet-e2e}"
BASE_API_PORT="${E2E_LOCALNET_API_PORT:-39080}"
BASE_P2P_PORT="${E2E_LOCALNET_P2P_PORT:-39337}"
PEERS="${E2E_LOCALNET_PEERS:-1}"
SEED="${E2E_LOCALNET_SEED:-e2e-localnet}"
TIMEOUT_SECS="${E2E_LOCALNET_TIMEOUT:-90}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required for localnet readiness checks." >&2
  exit 1
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo is required to build localnet binaries when absent." >&2
  exit 1
fi

if ! command -v lsof >/dev/null 2>&1; then
  echo "lsof is required for localnet port checks." >&2
  exit 1
fi

if [[ ! -x "${KAGAMI_BIN}" || ! -x "${IROHAD_BIN}" ]]; then
  echo "Building missing localnet binaries (profile=${PROFILE}, target_dir=${TARGET_DIR})..."
  BUILD_ARGS=(build --bin kagami --bin irohad)
  if [[ "${PROFILE}" == "release" ]]; then
    BUILD_ARGS=(build --release --bin kagami --bin irohad)
  fi
  (
    cd "${IROHA_DIR}"
    CARGO_TARGET_DIR="${TARGET_DIR}" cargo "${BUILD_ARGS[@]}"
  )
fi

if [[ ! -x "${KAGAMI_BIN}" ]]; then
  echo "kagami binary not found or not executable: ${KAGAMI_BIN}" >&2
  exit 1
fi

if [[ ! -x "${IROHAD_BIN}" ]]; then
  echo "irohad binary not found or not executable: ${IROHAD_BIN}" >&2
  exit 1
fi

cleanup() {
  if [[ "${E2E_KEEP_LOCALNET:-0}" != "1" && -d "${OUT_DIR}" ]]; then
    (
      cd "${OUT_DIR}"
      ./stop.sh >/dev/null 2>&1 || true
    )
  fi
}
trap cleanup EXIT

is_port_busy() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1
}

ensure_port_available() {
  local port="$1"
  local label="$2"

  if ! is_port_busy "${port}"; then
    return 0
  fi

  echo "${label} port ${port} is already in use. Attempting cleanup..."
  if [[ -x "${OUT_DIR}/stop.sh" ]]; then
    (
      cd "${OUT_DIR}"
      ./stop.sh >/dev/null 2>&1 || true
    )
    sleep 1
  fi

  if is_port_busy "${port}"; then
    echo "${label} port ${port} is still busy. Stop the conflicting process or set E2E_LOCALNET_${label}_PORT." >&2
    exit 1
  fi
}

ensure_port_available "${BASE_API_PORT}" "API"
ensure_port_available "${BASE_P2P_PORT}" "P2P"

rm -rf "${OUT_DIR}"
"${KAGAMI_BIN}" localnet \
  --build-line iroha3 \
  --consensus-mode permissioned \
  --bind-host 127.0.0.1 \
  --public-host 127.0.0.1 \
  --base-api-port "${BASE_API_PORT}" \
  --base-p2p-port "${BASE_P2P_PORT}" \
  --peers "${PEERS}" \
  --seed "${SEED}" \
  --block-time-ms 1000 \
  --commit-time-ms 1000 \
  --out-dir "${OUT_DIR}"

AUTH_PUBLIC_KEY="$(awk -F'\"' '/^public_key/{print $2; exit}' "${OUT_DIR}/client.toml")"
AUTH_PRIVATE_KEY="$(awk -F'\"' '/^private_key/{print $2; exit}' "${OUT_DIR}/client.toml")"
CHAIN_ID="$(awk -F'\"' '/^chain/{print $2; exit}' "${OUT_DIR}/client.toml")"
TORII_URL="$(awk -F'\"' '/^torii_url/{print $2; exit}' "${OUT_DIR}/client.toml")"

if [[ -z "${AUTH_PUBLIC_KEY}" || -z "${AUTH_PRIVATE_KEY}" || -z "${CHAIN_ID}" || -z "${TORII_URL}" ]]; then
  echo "Failed to parse generated localnet client.toml (${OUT_DIR}/client.toml)." >&2
  exit 1
fi

cat >> "${OUT_DIR}/peer0.toml" <<EOF

[torii.onboarding]
enabled = true
authority = "${AUTH_PUBLIC_KEY}@wonderland"
private_key = "${AUTH_PRIVATE_KEY}"
allowed_domain = "wonderland"
EOF

(
  cd "${OUT_DIR}"
  chmod +x start.sh stop.sh
  ./stop.sh >/dev/null 2>&1 || true
  IROHAD_BIN="${IROHAD_BIN}" ./start.sh
)

READY=0
for ((i = 1; i <= TIMEOUT_SECS; i++)); do
  if curl -sf "${TORII_URL%/}/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [[ "${READY}" != "1" ]]; then
  echo "Localnet did not become ready at ${TORII_URL} within ${TIMEOUT_SECS}s." >&2
  exit 1
fi

echo "Localnet ready at ${TORII_URL} (chain=${CHAIN_ID}, out=${OUT_DIR})"

if [[ "${E2E_STATEFUL:-0}" == "1" ]]; then
  (
    cd "${PROJECT_ROOT}"
    E2E_TORII_URL="${TORII_URL}" E2E_CHAIN_ID="${CHAIN_ID}" npm run e2e:live:stateful
  )
else
  (
    cd "${PROJECT_ROOT}"
    E2E_TORII_URL="${TORII_URL}" E2E_CHAIN_ID="${CHAIN_ID}" npm run e2e:live
  )
fi
