#!/usr/bin/env bash
set -euo pipefail

SCRIPT_NAME="$(basename "$0")"
ENV_FILE="${1:-${HOME}/.taskapp_prod_env}"
SERVICE_NAME="${TASKAPP_KEYCHAIN_SERVICE:-taskapp-production}"
MANIFEST_ACCOUNT="__TASKAPP_KEYS__"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Secrets file not found: ${ENV_FILE}" >&2
  echo "Usage: ${SCRIPT_NAME} [path_to_env_file]" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

keys=()
while IFS= read -r line; do
  if [[ "${line}" =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)= ]]; then
    key="${BASH_REMATCH[2]}"
    value="${!key:-}"
    if [[ -n "${value}" ]]; then
      security add-generic-password -U -a "${key}" -s "${SERVICE_NAME}" -w "${value}" >/dev/null
      already_seen=0
      for existing_key in "${keys[@]-}"; do
        if [[ "${existing_key}" == "${key}" ]]; then
          already_seen=1
          break
        fi
      done
      if [[ "${already_seen}" -eq 0 ]]; then
        keys+=("${key}")
      fi
    fi
  fi
done < "${ENV_FILE}"

if [[ "${#keys[@]}" -eq 0 ]]; then
  echo "No non-empty KEY=VALUE entries found in ${ENV_FILE}." >&2
  exit 1
fi

manifest_value="$(IFS=,; printf '%s' "${keys[*]}")"
security add-generic-password -U -a "${MANIFEST_ACCOUNT}" -s "${SERVICE_NAME}" -w "${manifest_value}" >/dev/null

echo "Stored ${#keys[@]} secrets in Keychain service ${SERVICE_NAME}."
echo "Run scripts/promote_with_checks.sh <staging|production> to execute rollout checks."
