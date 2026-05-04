#!/usr/bin/env ruby

require "pg"

required_vars = %w[
  DATABASE_ADMIN_URL
  APP_DB_NAME
  APP_RW_PASSWORD
  APP_RO_PASSWORD
  MIGRATION_ADMIN_PASSWORD
]

missing = required_vars.select { |name| ENV[name].to_s.strip.empty? }
unless missing.empty?
  abort("Missing required environment variables: #{missing.join(", ")}")
end

admin_url = ENV.fetch("DATABASE_ADMIN_URL")
app_db_name = ENV.fetch("APP_DB_NAME")

role_passwords = {
  "migration_admin" => ENV.fetch("MIGRATION_ADMIN_PASSWORD"),
  "app_rw" => ENV.fetch("APP_RW_PASSWORD"),
  "app_ro" => ENV.fetch("APP_RO_PASSWORD")
}

connection = PG.connect(admin_url)
quote_ident = PG::Connection.method(:quote_ident)
quote_literal = ->(value) { connection.escape_literal(value.to_s) }

role_passwords.each do |role_name, role_password|
  begin
    connection.exec("CREATE ROLE #{quote_ident.call(role_name)} LOGIN")
  rescue PG::DuplicateObject
    # Role already exists; continue.
  end
  connection.exec(
    "ALTER ROLE #{quote_ident.call(role_name)} PASSWORD #{quote_literal.call(role_password)}"
  )
end

connection.exec("REVOKE ALL ON DATABASE #{quote_ident.call(app_db_name)} FROM PUBLIC")
connection.exec("GRANT CONNECT ON DATABASE #{quote_ident.call(app_db_name)} TO migration_admin, app_rw, app_ro")

connection.exec("ALTER SCHEMA public OWNER TO migration_admin")
connection.exec("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
connection.exec("GRANT USAGE ON SCHEMA public TO migration_admin, app_rw, app_ro")
connection.exec("GRANT CREATE ON SCHEMA public TO migration_admin")

connection.exec("SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public'").each do |row|
  connection.exec(
    "ALTER TABLE #{quote_ident.call(row.fetch("schemaname"))}.#{quote_ident.call(row.fetch("tablename"))} OWNER TO migration_admin"
  )
end

connection.exec("SELECT sequence_schema, sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'").each do |row|
  connection.exec(
    "ALTER SEQUENCE #{quote_ident.call(row.fetch("sequence_schema"))}.#{quote_ident.call(row.fetch("sequence_name"))} OWNER TO migration_admin"
  )
end

connection.exec(<<~SQL).each do |row|
  SELECT n.nspname AS schema_name, t.typname AS type_name
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd')
SQL
  connection.exec(
    "ALTER TYPE #{quote_ident.call(row.fetch("schema_name"))}.#{quote_ident.call(row.fetch("type_name"))} OWNER TO migration_admin"
  )
end

connection.exec("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_rw")
connection.exec("GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_ro")
connection.exec("GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_rw")
connection.exec("GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO app_ro")

current_user = connection.exec("SELECT current_user AS current_user").first.fetch("current_user")
connection.exec("GRANT migration_admin TO #{quote_ident.call(current_user)}")
connection.exec("SET ROLE migration_admin")
connection.exec("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw")
connection.exec("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_ro")
connection.exec("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_rw")
connection.exec("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO app_ro")
connection.exec("RESET ROLE")

connection.close
