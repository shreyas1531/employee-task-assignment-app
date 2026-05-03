#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ "${TASKAPP_SECRETS_LOADED:-0}" != "1" ]]; then
  exec "${SCRIPT_DIR}/load_secrets_from_keychain.sh" -- "${SCRIPT_DIR}/run_rollout_verification.sh" "$@"
fi

usage() {
  echo "Usage: $(basename "$0") <staging|production> [base_url_override] [evidence_dir]" >&2
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

if [[ -n "${BASE_URL_OVERRIDE}" ]]; then
  BASE_URL="${BASE_URL_OVERRIDE}"
fi

BASE_URL_LABEL="${TARGET_UPPER}_BASE_URL|BASE_URL|APP_BASE_URL"
DATABASE_URL_LABEL="${TARGET_UPPER}_DATABASE_URL|RUNTIME_DATABASE_URL|DATABASE_URL"
MANAGER_EMAIL="${MANAGER_EMAIL:-}"
MANAGER_PASSWORD="${MANAGER_PASSWORD:-}"

if [[ -z "${BASE_URL}" || -z "${DATABASE_URL}" || -z "${MANAGER_EMAIL}" || -z "${MANAGER_PASSWORD}" ]]; then
  echo "Missing required secrets for ${TARGET_ENV}: one of ${BASE_URL_LABEL}, one of ${DATABASE_URL_LABEL}, MANAGER_EMAIL, MANAGER_PASSWORD." >&2
  exit 1
fi

BASE_URL="${BASE_URL%/}"
DATABASE_HOST="$(ruby -ruri -e 'u = URI(ARGV[0]); print u.host.to_s' "${DATABASE_URL}" 2>/dev/null || true)"
if [[ -z "${DATABASE_HOST}" ]]; then
  echo "Unable to parse host from ${DATABASE_URL_LABEL}." >&2
  exit 1
fi
case "${DATABASE_HOST}" in
  localhost|127.0.0.1|0.0.0.0)
    echo "Runtime DB URL points to localhost (${DATABASE_HOST}). Use managed central DB URL." >&2
    exit 1
    ;;
esac
EVIDENCE_DIR="${3:-${BACKEND_DIR}/verification_evidence}"
mkdir -p "${EVIDENCE_DIR}"
TIMESTAMP_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
TIMESTAMP_FILE="$(date -u +"%Y%m%dT%H%M%SZ")"
EVIDENCE_FILE="${EVIDENCE_DIR}/${TARGET_ENV}_verification_${TIMESTAMP_FILE}.json"

TMP_FILES=()
LAST_STATUS=""
LAST_BODY_FILE=""

cleanup() {
  for file_path in "${TMP_FILES[@]-}"; do
    if [[ -f "${file_path}" ]]; then
      rm -f "${file_path}"
    fi
  done
}
trap cleanup EXIT

request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local token="${4:-}"
  local output_file

  output_file="$(mktemp)"
  TMP_FILES+=("${output_file}")

  local curl_args=(
    -sS
    -o "${output_file}"
    -w "%{http_code}"
    -X "${method}"
    "${url}"
  )

  if [[ -n "${body}" ]]; then
    curl_args+=(
      -H "Content-Type: application/json"
      --data "${body}"
    )
  fi
  if [[ -n "${token}" ]]; then
    curl_args+=(
      -H "Authorization: Bearer ${token}"
    )
  fi

  LAST_STATUS="$(curl "${curl_args[@]}")"
  LAST_BODY_FILE="${output_file}"
}

assert_status() {
  local expected="$1"
  local step_name="$2"
  if [[ "${LAST_STATUS}" != "${expected}" ]]; then
    echo "${step_name} failed: expected HTTP ${expected}, got ${LAST_STATUS}." >&2
    cat "${LAST_BODY_FILE}" >&2 || true
    exit 1
  fi
}

extract_json_value() {
  local json_file="$1"
  local ruby_expr="$2"
  ruby -rjson -e "data = JSON.parse(File.read(ARGV[0])); value = (${ruby_expr}); print(value.to_s)" "${json_file}"
}

employee_suffix="$(ruby -rsecurerandom -e 'print SecureRandom.hex(6)')"
employee_email="rollout.${TARGET_ENV}.${employee_suffix}@example.com"
employee_password="Emp!${employee_suffix}9"
employee_phone="$(ruby -e 'print "9#{rand(10**9).to_s.rjust(9, "0")}"')"
due_at="$(ruby -rtime -e 'print (Time.now.utc + 3600).iso8601')"

request "GET" "${BASE_URL}/api/health"
health_status="${LAST_STATUS}"
assert_status "200" "Health check"

root_file="$(mktemp)"
TMP_FILES+=("${root_file}")
root_status="$(curl -sS -o "${root_file}" -w "%{http_code}" "${BASE_URL}/")"
if [[ "${root_status}" != "200" ]]; then
  echo "Root endpoint failed: expected HTTP 200, got ${root_status}." >&2
  exit 1
fi
if grep -q "Employee Task Assignment" "${root_file}"; then
  root_contains_title="true"
else
  root_contains_title="false"
  echo "Root endpoint did not contain expected title text." >&2
  exit 1
fi

manager_login_payload="$(MANAGER_EMAIL="${MANAGER_EMAIL}" MANAGER_PASSWORD="${MANAGER_PASSWORD}" ruby -rjson -e 'print({email: ENV.fetch("MANAGER_EMAIL"), password: ENV.fetch("MANAGER_PASSWORD")}.to_json)')"
request "POST" "${BASE_URL}/api/auth/login" "${manager_login_payload}"
manager_login_status="${LAST_STATUS}"
assert_status "200" "Manager login"
manager_token="$(extract_json_value "${LAST_BODY_FILE}" 'data["token"]')"
if [[ -z "${manager_token}" ]]; then
  echo "Manager login token missing in response." >&2
  exit 1
fi

create_employee_payload="$(EMPLOYEE_EMAIL="${employee_email}" EMPLOYEE_PASSWORD="${employee_password}" EMPLOYEE_PHONE="${employee_phone}" ruby -rjson -e 'print({name: "Rollout Employee", email: ENV.fetch("EMPLOYEE_EMAIL"), phone: ENV.fetch("EMPLOYEE_PHONE"), password: ENV.fetch("EMPLOYEE_PASSWORD")}.to_json)')"
request "POST" "${BASE_URL}/api/employees" "${create_employee_payload}" "${manager_token}"
create_employee_status="${LAST_STATUS}"
assert_status "200" "Create employee"
employee_id="$(extract_json_value "${LAST_BODY_FILE}" '(data["employee"] || {})["id"]')"
if [[ -z "${employee_id}" ]]; then
  echo "Employee ID missing in create employee response." >&2
  exit 1
fi

employee_login_payload="$(EMPLOYEE_EMAIL="${employee_email}" EMPLOYEE_PASSWORD="${employee_password}" ruby -rjson -e 'print({email: ENV.fetch("EMPLOYEE_EMAIL"), password: ENV.fetch("EMPLOYEE_PASSWORD")}.to_json)')"
request "POST" "${BASE_URL}/api/auth/login" "${employee_login_payload}"
employee_login_status="${LAST_STATUS}"
assert_status "200" "Employee login"
employee_token="$(extract_json_value "${LAST_BODY_FILE}" 'data["token"]')"
if [[ -z "${employee_token}" ]]; then
  echo "Employee login token missing in response." >&2
  exit 1
fi

assign_task_payload="$(EMPLOYEE_ID="${employee_id}" DUE_AT="${due_at}" ruby -rjson -e 'print({title: "Rollout verification task", description: "Automated rollout verification", assigneeId: ENV.fetch("EMPLOYEE_ID"), dueAt: ENV.fetch("DUE_AT"), urgency: "High", reminderEveryMinutes: 10, persistentReminders: true}.to_json)')"
request "POST" "${BASE_URL}/api/tasks" "${assign_task_payload}" "${manager_token}"
assign_task_status="${LAST_STATUS}"
assert_status "200" "Assign task"
task_id="$(extract_json_value "${LAST_BODY_FILE}" '(data["task"] || {})["id"]')"
if [[ -z "${task_id}" ]]; then
  echo "Task ID missing in assign task response." >&2
  exit 1
fi

request "POST" "${BASE_URL}/api/tasks/${task_id}/reminder" '{"source":"manual"}' "${manager_token}"
send_reminder_status="${LAST_STATUS}"
assert_status "200" "Send reminder"

request "POST" "${BASE_URL}/api/tasks/${task_id}/complete" "{}" "${employee_token}"
complete_task_status="${LAST_STATUS}"
assert_status "200" "Complete task"
completed_task_state="$(extract_json_value "${LAST_BODY_FILE}" '(data["task"] || {})["status"]')"
if [[ "${completed_task_state}" != "Completed" ]]; then
  echo "Complete task response status is ${completed_task_state}, expected Completed." >&2
  exit 1
fi

request "GET" "${BASE_URL}/api/workspace" "" "${manager_token}"
workspace_status="${LAST_STATUS}"
assert_status "200" "Workspace verification"
workspace_task_status="$(ruby -rjson -e 'data = JSON.parse(File.read(ARGV[0])); task = (data["tasks"] || []).find { |item| item["id"] == ARGV[1] }; print(task ? task["status"].to_s : "")' "${LAST_BODY_FILE}" "${task_id}")"
if [[ "${workspace_task_status}" != "Completed" ]]; then
  echo "Workspace task status is ${workspace_task_status}, expected Completed." >&2
  exit 1
fi

TARGET_ENV="${TARGET_ENV}" \
BASE_URL="${BASE_URL}" \
DATABASE_HOST="${DATABASE_HOST}" \
TIMESTAMP_UTC="${TIMESTAMP_UTC}" \
EVIDENCE_FILE="${EVIDENCE_FILE}" \
HEALTH_STATUS="${health_status}" \
ROOT_STATUS="${root_status}" \
ROOT_CONTAINS_TITLE="${root_contains_title}" \
MANAGER_LOGIN_STATUS="${manager_login_status}" \
CREATE_EMPLOYEE_STATUS="${create_employee_status}" \
EMPLOYEE_LOGIN_STATUS="${employee_login_status}" \
ASSIGN_TASK_STATUS="${assign_task_status}" \
SEND_REMINDER_STATUS="${send_reminder_status}" \
COMPLETE_TASK_STATUS="${complete_task_status}" \
WORKSPACE_STATUS="${workspace_status}" \
EMPLOYEE_ID="${employee_id}" \
TASK_ID="${task_id}" \
WORKSPACE_TASK_STATUS="${workspace_task_status}" \
ruby -rjson -e 'payload = { timestamp_utc: ENV.fetch("TIMESTAMP_UTC"), environment: ENV.fetch("TARGET_ENV"), base_url: ENV.fetch("BASE_URL"), database_host: ENV.fetch("DATABASE_HOST"), checks: { health_status: ENV.fetch("HEALTH_STATUS"), root_status: ENV.fetch("ROOT_STATUS"), root_contains_title: ENV.fetch("ROOT_CONTAINS_TITLE") == "true", manager_login_status: ENV.fetch("MANAGER_LOGIN_STATUS"), create_employee_status: ENV.fetch("CREATE_EMPLOYEE_STATUS"), employee_login_status: ENV.fetch("EMPLOYEE_LOGIN_STATUS"), assign_task_status: ENV.fetch("ASSIGN_TASK_STATUS"), send_reminder_status: ENV.fetch("SEND_REMINDER_STATUS"), complete_task_status: ENV.fetch("COMPLETE_TASK_STATUS"), workspace_status: ENV.fetch("WORKSPACE_STATUS") }, employee_id: ENV.fetch("EMPLOYEE_ID"), task_id: ENV.fetch("TASK_ID"), workspace_task_status: ENV.fetch("WORKSPACE_TASK_STATUS") }; File.write(ENV.fetch("EVIDENCE_FILE"), JSON.pretty_generate(payload))'

echo "Rollout verification passed for ${TARGET_ENV}; evidence saved to ${EVIDENCE_FILE}." >&2
printf '%s\n' "${EVIDENCE_FILE}"
