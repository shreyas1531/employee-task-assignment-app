#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ "${TASKAPP_SECRETS_LOADED:-0}" != "1" ]]; then
  exec "${SCRIPT_DIR}/load_secrets_from_keychain.sh" -- "${SCRIPT_DIR}/promote_with_checks.sh" "$@"
fi

usage() {
  echo "Usage: $(basename "$0") <staging|production> [base_url_override]" >&2
  exit 1
}

TARGET_ENV="${1:-}"
if [[ "${TARGET_ENV}" != "staging" && "${TARGET_ENV}" != "production" ]]; then
  usage
fi

TARGET_UPPER="$(printf '%s' "${TARGET_ENV}" | tr '[:lower:]' '[:upper:]')"
BASE_URL_OVERRIDE="${2:-}"

resolve_env_value() {
  local var_name=""
  for var_name in "$@"; do
    if [[ -n "${var_name}" && -n "${!var_name:-}" ]]; then
      printf '%s' "${!var_name}"
      return 0
    fi
  done
  return 1
}

BASE_URL="$(resolve_env_value "${TARGET_UPPER}_BASE_URL" "BASE_URL" "APP_BASE_URL" || true)"
DATABASE_URL="$(resolve_env_value "${TARGET_UPPER}_DATABASE_URL" "RUNTIME_DATABASE_URL" "DATABASE_URL" || true)"
MIGRATION_DATABASE_URL="$(resolve_env_value "${TARGET_UPPER}_MIGRATION_DATABASE_URL" "MIGRATION_DATABASE_URL" || true)"
if [[ -z "${MIGRATION_DATABASE_URL}" ]]; then
  MIGRATION_DATABASE_URL="${DATABASE_URL}"
fi
if [[ -n "${BASE_URL_OVERRIDE}" ]]; then
  BASE_URL="${BASE_URL_OVERRIDE}"
fi

if [[ -z "${BASE_URL}" || -z "${DATABASE_URL}" ]]; then
  echo "Missing required secrets for ${TARGET_ENV}: one of ${TARGET_UPPER}_BASE_URL|BASE_URL|APP_BASE_URL and one of ${TARGET_UPPER}_DATABASE_URL|RUNTIME_DATABASE_URL|DATABASE_URL." >&2
  exit 1
fi

managed_db_host() {
  local db_url="$1"
  local var_name="$2"
  local db_host
  db_host="$(ruby -ruri -e 'u = URI(ARGV[0]); print u.host.to_s' "${db_url}" 2>/dev/null || true)"
  if [[ -z "${db_host}" ]]; then
    echo "Unable to parse host from ${var_name}." >&2
    exit 1
  fi
  case "${db_host}" in
    localhost|127.0.0.1|0.0.0.0)
      echo "${var_name} points to localhost (${db_host}). Use managed central DB URL." >&2
      exit 1
      ;;
  esac
  printf '%s\n' "${db_host}"
}

runtime_db_host="$(managed_db_host "${DATABASE_URL}" "${TARGET_UPPER}_DATABASE_URL|RUNTIME_DATABASE_URL|DATABASE_URL")"
migration_db_host="$(managed_db_host "${MIGRATION_DATABASE_URL}" "${TARGET_UPPER}_MIGRATION_DATABASE_URL|MIGRATION_DATABASE_URL")"

echo "Applying schema and manager seed against ${TARGET_ENV} migration database..."
DATABASE_URL="${MIGRATION_DATABASE_URL}" bundle exec ruby "${SCRIPT_DIR}/setup_db.rb"

echo "Running rollout verification flow against ${TARGET_ENV} endpoint..."
verification_evidence_file="$("${SCRIPT_DIR}/run_rollout_verification.sh" "${TARGET_ENV}" "${BASE_URL}")"

mkdir -p "${BACKEND_DIR}/verification_evidence"
timestamp_utc="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
timestamp_file="$(date -u +"%Y%m%dT%H%M%SZ")"
promotion_record_file="${BACKEND_DIR}/verification_evidence/${TARGET_ENV}_promotion_${timestamp_file}.json"

TARGET_ENV="${TARGET_ENV}" \
BASE_URL="${BASE_URL}" \
TIMESTAMP_UTC="${timestamp_utc}" \
RUNTIME_DB_HOST="${runtime_db_host}" \
MIGRATION_DB_HOST="${migration_db_host}" \
VERIFICATION_EVIDENCE_FILE="${verification_evidence_file}" \
PROMOTION_RECORD_FILE="${promotion_record_file}" \
ruby -rjson -e 'payload = { timestamp_utc: ENV.fetch("TIMESTAMP_UTC"), environment: ENV.fetch("TARGET_ENV"), base_url: ENV.fetch("BASE_URL"), runtime_database_host: ENV.fetch("RUNTIME_DB_HOST"), migration_database_host: ENV.fetch("MIGRATION_DB_HOST"), verification_evidence_file: ENV.fetch("VERIFICATION_EVIDENCE_FILE"), status: "passed" }; File.write(ENV.fetch("PROMOTION_RECORD_FILE"), JSON.pretty_generate(payload))'

echo "Promotion checks passed for ${TARGET_ENV}."
echo "Verification evidence: ${verification_evidence_file}"
echo "Promotion record: ${promotion_record_file}"
