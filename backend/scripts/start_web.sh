#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
if [[ "${LOAD_DOTENV_FILE:-1}" == "1" && "${RACK_ENV:-development}" != "production" && -f "${BACKEND_DIR}/.env" ]]; then
  set -a
  source "${BACKEND_DIR}/.env"
  set +a
fi

export APP_HOST="${APP_HOST:-0.0.0.0}"
export APP_PORT="${PORT:-${APP_PORT:-4567}}"
export FRONTEND_ROOT="${FRONTEND_ROOT:-${BACKEND_DIR}/..}"
export BUNDLE_GEMFILE="${BACKEND_DIR}/Gemfile"

exec bundle exec rackup "${BACKEND_DIR}/config.ru" -o "${APP_HOST}" -p "${APP_PORT}"
