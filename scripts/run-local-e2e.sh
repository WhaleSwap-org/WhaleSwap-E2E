#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/run-local-e2e.sh [playwright-args...]

Starts local Hardhat + deploy + UI, then runs Playwright tests.

Environment overrides:
  CONTRACT_DIR   Path to whaleswap-contract repo
  UI_DIR         Path to whaleswap-ui repo
  HARDHAT_HOST   Hardhat host (default: 127.0.0.1)
  HARDHAT_PORT   Hardhat port (default: 8545)
  UI_HOST        UI host (default: 127.0.0.1)
  UI_PORT        UI port (default: 5500)
  HEADLESS       true/false (default: true)
  REUSE_EXISTING_SERVICES true/false (default: true)
  LOG_DIR        Log directory (default: ./.logs/local-e2e)

Examples:
  scripts/run-local-e2e.sh
  scripts/run-local-e2e.sh tests/specs/create-order.spec.ts --project=chromium
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
E2E_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CONTRACT_DIR="${CONTRACT_DIR:-${E2E_DIR}/../whaleswap-contract}"
UI_DIR="${UI_DIR:-${E2E_DIR}/../whaleswap-ui}"

HARDHAT_HOST="${HARDHAT_HOST:-127.0.0.1}"
HARDHAT_PORT="${HARDHAT_PORT:-8545}"
UI_HOST="${UI_HOST:-127.0.0.1}"
UI_PORT="${UI_PORT:-5500}"
HEADLESS="${HEADLESS:-true}"
REUSE_EXISTING_SERVICES="${REUSE_EXISTING_SERVICES:-true}"
LOG_DIR="${LOG_DIR:-${E2E_DIR}/.logs/local-e2e}"

HARDHAT_RPC_URL="http://${HARDHAT_HOST}:${HARDHAT_PORT}"
BASE_URL="http://${UI_HOST}:${UI_PORT}"

HARDHAT_PID=""
UI_PID=""
STARTED_HARDHAT=0
STARTED_UI=0

cleanup() {
  if [[ "${STARTED_UI}" -eq 1 ]] && [[ -n "${UI_PID}" ]] && kill -0 "${UI_PID}" 2>/dev/null; then
    echo "Stopping UI (pid ${UI_PID})"
    kill "${UI_PID}" || true
    wait "${UI_PID}" 2>/dev/null || true
  fi

  if [[ "${STARTED_HARDHAT}" -eq 1 ]] && [[ -n "${HARDHAT_PID}" ]] && kill -0 "${HARDHAT_PID}" 2>/dev/null; then
    echo "Stopping Hardhat (pid ${HARDHAT_PID})"
    kill "${HARDHAT_PID}" || true
    wait "${HARDHAT_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

require_cmd() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}" >&2
    exit 1
  fi
}

assert_repo_dir() {
  local dir="$1"
  local label="$2"
  if [[ ! -d "${dir}" || ! -f "${dir}/package.json" ]]; then
    echo "${label} directory is invalid: ${dir}" >&2
    exit 1
  fi
}

is_hardhat_ready() {
  curl -sS \
    -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
    "${HARDHAT_RPC_URL}" | grep -q '"result"'
}

is_ui_ready() {
  curl -fsS "${BASE_URL}/" >/dev/null 2>&1
}

wait_for() {
  local label="$1"
  local timeout_s="$2"
  local fn="$3"

  local elapsed=0
  while (( elapsed < timeout_s )); do
    if "${fn}"; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  echo "Timed out waiting for ${label} after ${timeout_s}s" >&2
  return 1
}

require_cmd npm
require_cmd npx
require_cmd curl

assert_repo_dir "${CONTRACT_DIR}" "Contract repo"
assert_repo_dir "${UI_DIR}" "UI repo"
assert_repo_dir "${E2E_DIR}" "E2E repo"

mkdir -p "${LOG_DIR}"

if is_hardhat_ready; then
  if [[ "${REUSE_EXISTING_SERVICES}" == "true" ]]; then
    echo "Reusing existing Hardhat at ${HARDHAT_RPC_URL}"
  else
    echo "Hardhat RPC already reachable at ${HARDHAT_RPC_URL}. Stop existing process or set REUSE_EXISTING_SERVICES=true." >&2
    exit 1
  fi
else
  echo "Starting Hardhat on ${HARDHAT_RPC_URL}"
  (
    cd "${CONTRACT_DIR}"
    npm run node >"${LOG_DIR}/hardhat.log" 2>&1
  ) &
  HARDHAT_PID=$!
  STARTED_HARDHAT=1

  wait_for "Hardhat RPC" 45 is_hardhat_ready || {
    echo "Hardhat log tail:" >&2
    tail -n 80 "${LOG_DIR}/hardhat.log" >&2 || true
    exit 1
  }
fi

echo "Deploying local contracts"
(
  cd "${CONTRACT_DIR}"
  npm run deploy:local >"${LOG_DIR}/deploy.log" 2>&1
) || {
  echo "Deploy log tail:" >&2
  tail -n 120 "${LOG_DIR}/deploy.log" >&2 || true
  exit 1
}

if is_ui_ready; then
  if [[ "${REUSE_EXISTING_SERVICES}" == "true" ]]; then
    echo "Reusing existing UI at ${BASE_URL}"
  else
    echo "UI already reachable at ${BASE_URL}. Stop existing process or set REUSE_EXISTING_SERVICES=true." >&2
    exit 1
  fi
else
  echo "Starting UI on ${BASE_URL}"
  (
    cd "${UI_DIR}"
    npm run start -- -p "${UI_PORT}" -a "${UI_HOST}" >"${LOG_DIR}/ui.log" 2>&1
  ) &
  UI_PID=$!
  STARTED_UI=1

  wait_for "UI" 30 is_ui_ready || {
    echo "UI log tail:" >&2
    tail -n 80 "${LOG_DIR}/ui.log" >&2 || true
    exit 1
  }
fi

echo "Running Playwright tests (HEADLESS=${HEADLESS})"
echo "Logs: ${LOG_DIR}"
(
  cd "${E2E_DIR}"
  BASE_URL="${BASE_URL}" \
  MOCK_WALLET_RPC_URL="${HARDHAT_RPC_URL}" \
  HEADLESS="${HEADLESS}" \
  npx playwright test "$@"
)
