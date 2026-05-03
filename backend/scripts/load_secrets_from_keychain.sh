#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${TASKAPP_KEYCHAIN_SERVICE:-taskapp-production}"
MANIFEST_ACCOUNT="__TASKAPP_KEYS__"

usage() {
  echo "Usage: $(basename "$0") -- <command> [args...]" >&2
  exit 1
}

if [[ "${1:-}" != "--" ]]; then
  usage
fi
shift

if [[ "$#" -eq 0 ]]; then
  usage
fi

manifest_value="$(security find-generic-password -w -a "${MANIFEST_ACCOUNT}" -s "${SERVICE_NAME}")" || {
  echo "No TaskApp secrets found in Keychain service ${SERVICE_NAME}." >&2
  echo "Run scripts/store_secrets_in_keychain.sh first." >&2
  exit 1
}
if [[ "${manifest_value}" =~ ^[0-9A-Fa-f]+$ ]] && [[ "$(( ${#manifest_value} % 2 ))" -eq 0 ]]; then
  manifest_value="$(ruby -e 'print [ARGV[0]].pack("H*")' "${manifest_value}")"
fi

manifest_normalized="$(printf '%s' "${manifest_value}" | tr '\n' ',')"
IFS=',' read -r -a manifest_keys <<< "${manifest_normalized}"

loaded_count=0
for key in "${manifest_keys[@]-}"; do
  [[ -z "${key}" ]] && continue
  value="$(security find-generic-password -w -a "${key}" -s "${SERVICE_NAME}")" || {
    echo "Missing Keychain entry for ${key} in service ${SERVICE_NAME}." >&2
    exit 1
  }
  export "${key}=${value}"
  loaded_count=$((loaded_count + 1))
done

if [[ "${loaded_count}" -eq 0 ]]; then
  echo "TaskApp key manifest for ${SERVICE_NAME} is empty." >&2
  exit 1
fi

export TASKAPP_SECRETS_LOADED=1
exec "$@"
