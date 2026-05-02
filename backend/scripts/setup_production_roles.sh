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

psql "${DATABASE_ADMIN_URL}" \
  -v "app_db_name=${APP_DB_NAME}" \
  -v "app_rw_password=${APP_RW_PASSWORD}" \
  -v "app_ro_password=${APP_RO_PASSWORD}" \
  -v "migration_admin_password=${MIGRATION_ADMIN_PASSWORD}" \
  -f "${ROLES_SQL}"

echo "Provisioned roles migration_admin, app_rw, and app_ro for database ${APP_DB_NAME}."
