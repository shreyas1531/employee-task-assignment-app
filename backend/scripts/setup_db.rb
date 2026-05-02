#!/usr/bin/env ruby

require "dotenv/load"
require "pg"
require "bcrypt"

def db_connection
  database_url = ENV["DATABASE_URL"].to_s.strip
  if !database_url.empty?
    PG.connect(database_url)
  else
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
