#!/usr/bin/env ruby

require "dotenv/load"
require "pg"
require "bcrypt"
REQUIRED_TABLES = %w[users tasks sessions].freeze
MIGRATIONS_DIR = File.expand_path("../db/migrations", __dir__)

def database_url_candidates
  rack_env_key = ENV.fetch("RACK_ENV", "development").to_s.strip.upcase
  candidates = ["DATABASE_URL"]
  candidates << "#{rack_env_key}_MIGRATION_DATABASE_URL" unless rack_env_key.empty?
  candidates << "MIGRATION_DATABASE_URL"
  candidates << "#{rack_env_key}_DATABASE_URL" unless rack_env_key.empty?
  candidates.concat(
    %w[
      RUNTIME_DATABASE_URL
      PRODUCTION_MIGRATION_DATABASE_URL
      STAGING_MIGRATION_DATABASE_URL
      PRODUCTION_DATABASE_URL
      STAGING_DATABASE_URL
    ]
  )
  candidates.uniq
end

def resolved_database_url_with_key
  database_url_candidates.each do |candidate_key|
    candidate_value = ENV[candidate_key].to_s.strip
    return [candidate_key, candidate_value] unless candidate_value.empty?
  end
  [nil, ""]
end

def db_connection
  database_url_key, database_url = resolved_database_url_with_key
  if !database_url.empty?
    puts "Database URL source: #{database_url_key}"
    PG.connect(database_url)
  else
    puts "Database URL source: DB_HOST/DB_PORT/DB_NAME/DB_USER"
    PG.connect(
      host: ENV.fetch("DB_HOST", "127.0.0.1"),
      port: Integer(ENV.fetch("DB_PORT", "5432")),
      dbname: ENV.fetch("DB_NAME", "task_assignment"),
      user: ENV.fetch("DB_USER", "postgres"),
      password: ENV.fetch("DB_PASSWORD", "postgres")
    )
  end
end

def normalize_email(value)
  value.to_s.strip.downcase
end

connection = db_connection
schema_path = File.expand_path("../db/schema.sql", __dir__)
schema_sql = File.read(schema_path)
connection.exec(schema_sql)

connection.exec(<<~SQL)
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
SQL

migration_files = if Dir.exist?(MIGRATIONS_DIR)
  Dir.glob(File.join(MIGRATIONS_DIR, "*.sql")).sort
else
  []
end

migration_files.each do |migration_file|
  version = File.basename(migration_file)
  already_applied = connection.exec_params(
    "SELECT 1 FROM schema_migrations WHERE version = $1 LIMIT 1",
    [version]
  ).first
  next if already_applied

  migration_sql = File.read(migration_file)
  connection.transaction do |transaction|
    transaction.exec(migration_sql)
    transaction.exec_params(
      "INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW())",
      [version]
    )
  end
  puts "Applied migration: #{version}"
end
existing_tables = connection.exec_params(
  "SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename",
  ["public"]
).map { |row| row["tablename"] }
missing_tables = REQUIRED_TABLES.reject { |table_name| existing_tables.include?(table_name) }
if missing_tables.empty?
  puts "Migration status: up-to-date"
else
  abort("Migration status: failed; missing required tables: #{missing_tables.join(', ')}")
end
puts "Created tables: #{existing_tables.join(', ')}"

manager_email = normalize_email(ENV.fetch("MANAGER_EMAIL", "manager@taskapp.local"))
manager_password = ENV.fetch("MANAGER_PASSWORD", "manager123").to_s
manager_name = ENV.fetch("MANAGER_NAME", "Manager").to_s.strip
manager_phone = ENV.fetch("MANAGER_PHONE", "").to_s.gsub(/\D/, "")

if manager_email.empty? || manager_password.empty?
  abort("MANAGER_EMAIL and MANAGER_PASSWORD must be configured.")
end

password_hash = BCrypt::Password.create(manager_password, cost: BCrypt::Engine::DEFAULT_COST)
existing = connection.exec_params(
  "SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
  [manager_email]
).first

if existing
  connection.exec_params(
    <<~SQL,
      UPDATE users
      SET full_name = $1,
          phone = $2,
          role = 'manager',
          password_hash = $3,
          is_active = TRUE,
          updated_at = NOW()
      WHERE id = $4
    SQL
    [manager_name, manager_phone, password_hash, existing["id"]]
  )
  puts "Updated manager account #{manager_email}."
else
  connection.exec_params(
    <<~SQL,
      INSERT INTO users (id, email, full_name, phone, role, password_hash, is_active, created_at, updated_at)
      VALUES (gen_random_uuid(), $1, $2, $3, 'manager', $4, TRUE, NOW(), NOW())
    SQL
    [manager_email, manager_name, manager_phone, password_hash]
  )
  puts "Created manager account #{manager_email}."
end

puts "Database schema setup complete."
connection.close
