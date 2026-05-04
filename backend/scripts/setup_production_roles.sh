#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROLES_SQL="${SCRIPT_DIR}/../db/production_roles.sql"

required_vars=(
  DATABASE_ADMIN_URL
  APP_DB_NAME
  APP_RW_PASSWORD
  APP_RO_PASSWORD
  MIGRATION_ADMIN_PASSWORD
)

for var_name in "${required_vars[@]}"; do
  if [[ -z "${!var_name:-}" ]]; then
    echo "Missing required environment variable: ${var_name}" >&2
    exit 1
  fi
done

if command -v psql >/dev/null 2>&1; then
  psql "${DATABASE_ADMIN_URL}" \
    -v "app_db_name=${APP_DB_NAME}" \
    -v "app_rw_password=${APP_RW_PASSWORD}" \
    -v "app_ro_password=${APP_RO_PASSWORD}" \
    -v "migration_admin_password=${MIGRATION_ADMIN_PASSWORD}" \
    -f "${ROLES_SQL}"
else
  if ! command -v bundle >/dev/null 2>&1; then
    echo "psql is not available and bundler is not installed; cannot provision roles." >&2
    exit 1
  fi
  BUNDLE_GEMFILE="${SCRIPT_DIR}/../Gemfile" bundle exec ruby "${SCRIPT_DIR}/setup_production_roles.rb"
fi

echo "Provisioned roles migration_admin, app_rw, and app_ro for database ${APP_DB_NAME}."
