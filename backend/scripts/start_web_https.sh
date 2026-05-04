#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
EXPLICIT_APP_HOST="${APP_HOST-}"
EXPLICIT_APP_PORT="${APP_PORT-}"
EXPLICIT_PORT="${PORT-}"
EXPLICIT_FRONTEND_ROOT="${FRONTEND_ROOT-}"
EXPLICIT_HTTPS_CERT_FILE="${HTTPS_CERT_FILE-}"
EXPLICIT_HTTPS_KEY_FILE="${HTTPS_KEY_FILE-}"
EXPLICIT_TLS_CN="${TLS_CN-}"

if [[ "${LOAD_DOTENV_FILE:-1}" == "1" && "${RACK_ENV:-development}" != "production" && -f "${BACKEND_DIR}/.env" ]]; then
  set -a
  source "${BACKEND_DIR}/.env"
  set +a
fi

if [[ -n "${EXPLICIT_APP_HOST}" ]]; then APP_HOST="${EXPLICIT_APP_HOST}"; fi
if [[ -n "${EXPLICIT_APP_PORT}" ]]; then APP_PORT="${EXPLICIT_APP_PORT}"; fi
if [[ -n "${EXPLICIT_PORT}" ]]; then PORT="${EXPLICIT_PORT}"; fi
if [[ -n "${EXPLICIT_FRONTEND_ROOT}" ]]; then FRONTEND_ROOT="${EXPLICIT_FRONTEND_ROOT}"; fi
if [[ -n "${EXPLICIT_HTTPS_CERT_FILE}" ]]; then HTTPS_CERT_FILE="${EXPLICIT_HTTPS_CERT_FILE}"; fi
if [[ -n "${EXPLICIT_HTTPS_KEY_FILE}" ]]; then HTTPS_KEY_FILE="${EXPLICIT_HTTPS_KEY_FILE}"; fi
if [[ -n "${EXPLICIT_TLS_CN}" ]]; then TLS_CN="${EXPLICIT_TLS_CN}"; fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to run HTTPS mode." >&2
  exit 1
fi

export APP_HOST="${APP_HOST:-0.0.0.0}"
export APP_PORT="${PORT:-${APP_PORT:-8443}}"
export FRONTEND_ROOT="${FRONTEND_ROOT:-${BACKEND_DIR}/..}"
export BUNDLE_GEMFILE="${BACKEND_DIR}/Gemfile"

export HTTPS_CERT_FILE="${HTTPS_CERT_FILE:-${BACKEND_DIR}/tmp/ssl/taskapp.crt}"
export HTTPS_KEY_FILE="${HTTPS_KEY_FILE:-${BACKEND_DIR}/tmp/ssl/taskapp.key}"
TLS_CN="${TLS_CN:-localhost}"

mkdir -p "$(dirname "${HTTPS_CERT_FILE}")"
if [[ ! -f "${HTTPS_CERT_FILE}" || ! -f "${HTTPS_KEY_FILE}" ]]; then
  openssl req -x509 -newkey rsa:2048 -sha256 -days 365 -nodes \
    -keyout "${HTTPS_KEY_FILE}" \
    -out "${HTTPS_CERT_FILE}" \
    -subj "/CN=${TLS_CN}" >/dev/null 2>&1
fi

echo "Starting HTTPS server on ${APP_HOST}:${APP_PORT} using certificate ${HTTPS_CERT_FILE}."
exec bundle exec ruby "${SCRIPT_DIR}/start_web_https.rb"
