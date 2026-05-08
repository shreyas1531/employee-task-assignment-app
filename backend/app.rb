require "json"
require "time"
require "uri"
require "digest"
require "securerandom"
require "sinatra/base"
require "pg"
require "bcrypt"
require "dotenv/load"

class TaskAssignmentAPI < Sinatra::Base
  MAX_TEXT_LENGTH = 5000
  MAX_MESSAGE_LENGTH = 2000
  MAX_ATTACHMENT_COUNT = 5
  MAX_ATTACHMENT_BYTES = 1 * 1024 * 1024
  MAX_TOTAL_ATTACHMENT_BYTES = 4 * 1024 * 1024
  URGENCY_LEVELS = %w[Low Medium High Critical].freeze
  PO_STATUSES = [
    "Open",
    "Partially Received",
    "Received",
    "Delayed",
    "Cancelled"
  ].freeze
  ALERT_PRIORITIES = %w[Low Medium High Critical].freeze

  configure do
    frontend_root = ENV["FRONTEND_ROOT"].to_s.strip
    port_from_env = ENV["PORT"].to_s.strip
    app_port_from_env = ENV.fetch("APP_PORT", "4567").to_s.strip
    effective_port = if port_from_env.empty?
      app_port_from_env.empty? ? "4567" : app_port_from_env
    else
      port_from_env
    end
    set :bind, ENV.fetch("APP_HOST", "0.0.0.0")
    set :port, Integer(effective_port)
    set :show_exceptions, false
    set :logging, true
    set :rate_limit_store, {}
    set :rate_limit_mutex, Mutex.new
    set :frontend_root, frontend_root.empty? ? File.expand_path("..", __dir__) : File.expand_path(frontend_root, __dir__)
  end

  before do
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    if request.path_info.start_with?("/api")
      content_type :json
      response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none';"
      enforce_origin_policy!
    else
      response.headers["Content-Security-Policy"] = "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none';"
    end
  end

  options "/api/*" do
    set_cors_headers!
    204
  end

  after do
    set_cors_headers! if request.path_info.start_with?("/api")
  end

  helpers do
    def cors_allowed_origins
      configured = ENV["CORS_ORIGINS"].to_s.strip
      origins = if configured.empty?
        [
          "https://employee-task-assignment-app-885400484338.asia-south2.run.app",
          ENV["STAGING_BASE_URL"],
          ENV["PRODUCTION_BASE_URL"],
          ENV["APP_BASE_URL"],
          ENV["BASE_URL"],
          current_request_origin,
          "null",
          "http://localhost:3000",
          "http://127.0.0.1:3000",
          "http://localhost:5500",
          "http://127.0.0.1:5500"
        ]
      else
        configured.split(",")
      end
      origins.map { |origin| origin.to_s.strip }.reject(&:empty?).uniq
    end

    def current_request_origin
      scheme = request.scheme.to_s.strip
      host = request.host.to_s.strip
      port = request.port
      return nil if scheme.empty? || host.empty?

      default_port = (scheme == "https" && port == 443) || (scheme == "http" && port == 80)
      default_port ? "#{scheme}://#{host}" : "#{scheme}://#{host}:#{port}"
    end

    def origin_allowed?(origin)
      allowed = cors_allowed_origins
      return true if allowed.include?("*")
      allowed.include?(origin)
    end

    def enforce_origin_policy!
      origin = request.env["HTTP_ORIGIN"].to_s.strip
      return if origin.empty?
      return if origin_allowed?(origin)

      halt_json(403, error: "Origin not allowed.")
    end

    def set_cors_headers!
      origin = request.env["HTTP_ORIGIN"].to_s.strip
      allowed = cors_allowed_origins
      requested_headers = request.env["HTTP_ACCESS_CONTROL_REQUEST_HEADERS"].to_s.strip
      selected_origin = nil

      if allowed.include?("*")
        selected_origin = "*"
      elsif !origin.empty? && origin_allowed?(origin)
        selected_origin = origin
      end

      unless selected_origin.nil?
        response.headers["Access-Control-Allow-Origin"] = selected_origin
        response.headers["Vary"] = "Origin"
      end
      if !selected_origin.nil? && selected_origin != "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
      end

      response.headers["Access-Control-Allow-Headers"] = if requested_headers.empty?
        "Content-Type, Authorization"
      else
        requested_headers
      end
      response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
      response.headers["Access-Control-Max-Age"] = "86400"
    end

    def db_connection
      if defined?(@db_connection) && @db_connection && @db_connection.status == PG::CONNECTION_OK
        return @db_connection
      end

      database_url = ENV["DATABASE_URL"].to_s.strip
      @db_connection = if !database_url.empty?
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

    def db_exec(sql, params = [])
      db_connection.exec_params(sql, params)
    rescue PG::Error => error
      logger.error("Database error: #{error.message}")
      halt_json(500, error: "Database operation failed.")
    end

    def halt_json(status_code, payload)
      halt status_code, JSON.generate(payload)
    end

    def parse_json_body
      if request.content_length.to_i > 6 * 1024 * 1024
        halt_json(413, error: "Request payload is too large.")
      end

      request.body.rewind
      raw = request.body.read.to_s
      return {} if raw.strip.empty?

      JSON.parse(raw)
    rescue JSON::ParserError
      halt_json(400, error: "Invalid JSON payload.")
    end

    def normalize_email(value)
      value.to_s.strip.downcase
    end

    def normalize_phone(value)
      value.to_s.gsub(/\D/, "")
    end

    def valid_email?(value)
      /\A[^@\s]+@[^@\s]+\.[^@\s]+\z/.match?(value.to_s)
    end

    def sanitize_text(value, field_name, required:, max_length:)
      text = value.to_s.strip
      if required && text.empty?
        halt_json(400, error: "#{field_name} is required.")
      end
      if text.length > max_length
        halt_json(400, error: "#{field_name} exceeds #{max_length} characters.")
      end
      text
    end

    def parse_timestamp(value, field_name, required: true)
      raw = value.to_s.strip
      if raw.empty?
        halt_json(400, error: "#{field_name} is required.") if required
        return nil
      end
      Time.parse(raw).utc.iso8601
    rescue ArgumentError
      halt_json(400, error: "Invalid #{field_name}.")
    end

    def parse_positive_integer(value, field_name, min:, max:, default: nil)
      if value.nil? || value.to_s.strip.empty?
        return default unless default.nil?
        halt_json(400, error: "#{field_name} is required.")
      end

      parsed = Integer(value)
      if parsed < min || parsed > max
        halt_json(400, error: "#{field_name} must be between #{min} and #{max}.")
      end
      parsed
    rescue ArgumentError
      halt_json(400, error: "#{field_name} must be a valid integer.")
    end

    def parse_non_negative_decimal(value, field_name, default: nil)
      if value.nil? || value.to_s.strip.empty?
        return default unless default.nil?
        halt_json(400, error: "#{field_name} is required.")
      end

      parsed = Float(value)
      unless parsed.finite? && parsed >= 0
        halt_json(400, error: "#{field_name} must be a non-negative number.")
      end
      parsed.round(2)
    rescue ArgumentError, TypeError
      halt_json(400, error: "#{field_name} must be a valid number.")
    end

    def parse_boolean(value)
      value == true || value.to_s.strip.downcase == "true" || value.to_s.strip == "1"
    end

    def parse_json_column(value, fallback)
      return fallback if value.nil? || value.to_s.strip.empty?
      parsed = JSON.parse(value)
      parsed.nil? ? fallback : parsed
    rescue JSON::ParserError
      fallback
    end

    def session_ttl_hours
      value = Integer(ENV.fetch("SESSION_TTL_HOURS", "24"))
      [[value, 1].max, 168].min
    rescue ArgumentError
      24
    end

    def bearer_token
      header = request.env["HTTP_AUTHORIZATION"].to_s
      return nil if header.empty?
      return nil unless header.start_with?("Bearer ")

      header.split(" ", 2).last.to_s.strip
    end

    def digest_token(token)
      Digest::SHA256.hexdigest(token.to_s)
    end

    def serialize_user_row(row)
      {
        id: row["id"],
        email: row["email"],
        name: row["full_name"],
        phone: row["phone"],
        role: row["role"],
        createdAt: row["created_at"],
        updatedAt: row["updated_at"]
      }
    end

    def serialize_task_row(row)
      {
        id: row["id"],
        title: row["title"],
        description: row["description"] || "",
        assigneeId: row["assignee_id"],
        dueAt: row["due_at"],
        urgency: row["urgency"],
        status: row["status"],
        reminderEveryMinutes: row["reminder_every_minutes"].to_i,
        persistentReminders: row["persistent_reminders"] == "t",
        nextReminderAt: row["next_reminder_at"],
        lastReminderAt: row["last_reminder_at"],
        attachments: parse_json_column(row["attachments"], []),
        createdAt: row["created_at"],
        updatedAt: row["updated_at"],
        completedAt: row["completed_at"]
      }
    end

    def serialize_notification_row(row)
      {
        id: row["id"],
        employeeId: row["employee_id"],
        taskId: row["task_id"],
        type: row["type"],
        channel: row["channel"],
        message: row["message"],
        meta: parse_json_column(row["meta"], nil),
        createdAt: row["created_at"]
      }
    end

    def serialize_message_row(row)
      {
        id: row["id"],
        employeeId: row["employee_id"],
        taskId: row["task_id"],
        senderRole: row["sender_role"],
        content: row["content"],
        createdAt: row["created_at"]
      }
    end

    def serialize_vendor_row(row)
      {
        id: row["id"],
        name: row["name"],
        contactEmail: row["contact_email"],
        goods: parse_json_column(row["goods"], []),
        defaultCostPrice: row["default_cost_price"].to_f,
        createdAt: row["created_at"],
        updatedAt: row["updated_at"]
      }
    end

    def serialize_purchase_order_row(row)
      {
        id: row["id"],
        vendorId: row["vendor_id"],
        poNumber: row["po_number"],
        goods: row["goods"],
        quantity: row["quantity"].to_i,
        costPrice: row["cost_price"].to_f,
        raisedAt: row["raised_at"],
        expectedAt: row["expected_at"],
        status: row["status"],
        createdAt: row["created_at"]
      }
    end

    def serialize_vendor_alert_row(row)
      {
        id: row["id"],
        vendorId: row["vendor_id"],
        poId: row["po_id"],
        priority: row["priority"],
        message: row["message"],
        sentBy: row["sent_by_email"] || "",
        createdAt: row["created_at"]
      }
    end

    def current_user_from_session
      token = bearer_token
      return nil if token.nil? || token.empty?

      result = db_exec(
        <<~SQL,
          SELECT u.id,
                 u.email,
                 u.full_name,
                 u.phone,
                 u.role,
                 u.created_at,
                 u.updated_at,
                 s.expires_at
          FROM sessions s
          JOIN users u ON u.id = s.user_id
          WHERE s.token_digest = $1
            AND s.revoked_at IS NULL
            AND s.expires_at > NOW()
            AND u.is_active = TRUE
          LIMIT 1
        SQL
        [digest_token(token)]
      )

      row = result.first
      return nil unless row

      {
        user: serialize_user_row(row),
        expiresAt: row["expires_at"]
      }
    end

    def require_authentication!
      current = current_user_from_session
      halt_json(401, error: "Authentication required.") unless current
      current
    end

    def require_manager!
      current = require_authentication!
      halt_json(403, error: "Manager access required.") unless current[:user][:role] == "manager"
      current
    end

    def issue_session(user_id)
      token = SecureRandom.hex(32)
      expires_at = Time.now.utc + (session_ttl_hours * 60 * 60)

      db_exec(
        <<~SQL,
          UPDATE sessions
          SET revoked_at = NOW(),
              updated_at = NOW()
          WHERE user_id = $1
            AND revoked_at IS NULL
        SQL
        [user_id]
      )

      db_exec(
        <<~SQL,
          INSERT INTO sessions (id, user_id, token_digest, expires_at, created_at, updated_at)
          VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW())
        SQL
        [user_id, digest_token(token), expires_at.iso8601]
      )

      {
        token: token,
        expiresAt: expires_at.iso8601
      }
    end

    def enforce_rate_limit!(bucket_key, limit:, window_seconds:)
      now = Time.now.to_i
      blocked = false

      settings.rate_limit_mutex.synchronize do
        requests = settings.rate_limit_store[bucket_key] || []
        cutoff = now - window_seconds
        requests = requests.select { |timestamp| timestamp >= cutoff }
        blocked = requests.length >= limit
        requests << now unless blocked
        settings.rate_limit_store[bucket_key] = requests
      end

      halt_json(429, error: "Too many requests. Please try again shortly.") if blocked
    end

    def sanitize_goods_list(value)
      source_items = if value.is_a?(Array)
        value
      else
        value.to_s.split(",")
      end

      goods = source_items
        .map { |item| item.to_s.strip }
        .reject(&:empty?)
        .uniq

      halt_json(400, error: "At least one goods item is required.") if goods.empty?
      halt_json(400, error: "A maximum of 50 goods items is allowed.") if goods.length > 50

      goods.each do |item|
        if item.length > 100
          halt_json(400, error: "Each goods item must be 100 characters or fewer.")
        end
      end

      goods
    end

    def sanitize_attachments(raw_attachments)
      attachments = raw_attachments.is_a?(Array) ? raw_attachments : []
      if attachments.length > MAX_ATTACHMENT_COUNT
        halt_json(400, error: "A maximum of #{MAX_ATTACHMENT_COUNT} attachments is allowed.")
      end

      total_size = 0
      attachments.map.with_index do |attachment, index|
        unless attachment.is_a?(Hash)
          halt_json(400, error: "Attachment ##{index + 1} is invalid.")
        end

        name = sanitize_text(attachment["name"], "Attachment name", required: true, max_length: 255)
        type = sanitize_text(attachment["type"], "Attachment type", required: false, max_length: 120)
        data_url = attachment["dataUrl"].to_s
        if data_url.empty? || !data_url.start_with?("data:")
          halt_json(400, error: "Attachment ##{index + 1} has invalid data.")
        end
        if data_url.length > (MAX_ATTACHMENT_BYTES * 2)
          halt_json(400, error: "Attachment ##{index + 1} payload is too large.")
        end

        size = parse_positive_integer(
          attachment["size"],
          "Attachment size",
          min: 1,
          max: MAX_ATTACHMENT_BYTES
        )
        total_size += size
        if total_size > MAX_TOTAL_ATTACHMENT_BYTES
          halt_json(400, error: "Total attachment size exceeds allowed limit.")
        end

        uploaded_at = parse_timestamp(
          attachment["uploadedAt"],
          "Attachment upload timestamp",
          required: false
        ) || Time.now.utc.iso8601

        {
          id: attachment["id"].to_s.strip.empty? ? SecureRandom.uuid : attachment["id"].to_s.strip,
          name: name,
          type: type.empty? ? "application/octet-stream" : type,
          size: size,
          dataUrl: data_url,
          uploadedAt: uploaded_at
        }
      end
    end

    def task_row_by_id(task_id)
      db_exec(
        <<~SQL,
          SELECT id,
                 title,
                 description,
                 assignee_id,
                 due_at,
                 urgency,
                 status,
                 reminder_every_minutes,
                 persistent_reminders,
                 next_reminder_at,
                 last_reminder_at,
                 attachments,
                 created_by,
                 created_at,
                 updated_at,
                 completed_at
          FROM tasks
          WHERE id = $1
          LIMIT 1
        SQL
        [task_id]
      ).first
    end

    def create_notification(employee_id:, task_id:, type:, channel:, message:, meta: nil)
      db_exec(
        <<~SQL,
          INSERT INTO notifications (id, employee_id, task_id, type, channel, message, meta, created_at)
          VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, NOW())
        SQL
        [employee_id, task_id, type, channel, message, meta ? JSON.generate(meta) : nil]
      )
    end

    def truncate_text(text, max_chars)
      value = text.to_s
      return value if value.length <= max_chars

      "#{value[0...(max_chars - 1)]}…"
    end

    def build_whatsapp_url(phone:, employee_name:, task_title:, urgency:, due_at:, note:)
      normalized_phone = normalize_phone(phone)
      return nil if normalized_phone.empty?

      lines = [
        "Hello #{employee_name},",
        "Task: #{task_title}",
        "Urgency: #{urgency.to_s.upcase}",
        "Due: #{due_at}",
        note,
        "Please update progress in the Task Assignment app."
      ]
      encoded_text = URI.encode_www_form_component(lines.join("\n"))
      "https://wa.me/#{normalized_phone}?text=#{encoded_text}"
    end

    def send_frontend_file(filename, mime_type)
      path = File.expand_path(filename, settings.frontend_root)
      halt 404, "Not found." unless File.file?(path)

      content_type mime_type
      send_file path
    end
  end

  get "/" do
    send_frontend_file("index.html", :html)
  end

  get "/index.html" do
    redirect "/"
  end

  get "/styles.css" do
    send_frontend_file("styles.css", "text/css")
  end

  get "/app.js" do
    send_frontend_file("app.js", "application/javascript")
  end

  get "/favicon.ico" do
    status 204
  end

  get "/api/health" do
    JSON.generate(status: "ok")
  end

  post "/api/auth/login" do
    enforce_rate_limit!("login:#{request.ip}", limit: 12, window_seconds: 60)

    payload = parse_json_body
    email = normalize_email(payload["email"])
    password = payload["password"].to_s

    if email.empty? || password.empty?
      halt_json(400, error: "Email and password are required.")
    end

    user_row = db_exec(
      <<~SQL,
        SELECT id, email, full_name, phone, role, password_hash, created_at, updated_at
        FROM users
        WHERE LOWER(email) = LOWER($1)
          AND is_active = TRUE
        LIMIT 1
      SQL
      [email]
    ).first

    unless user_row
      halt_json(401, error: "Invalid email or password.")
    end

    password_match = begin
      BCrypt::Password.new(user_row["password_hash"]) == password
    rescue BCrypt::Errors::InvalidHash
      false
    end

    unless password_match
      halt_json(401, error: "Invalid email or password.")
    end

    session_payload = issue_session(user_row["id"])
    response = {
      token: session_payload[:token],
      expiresAt: session_payload[:expiresAt],
      user: serialize_user_row(user_row)
    }

    JSON.generate(response)
  end

  post "/api/auth/logout" do
    token = bearer_token
    halt_json(401, error: "Authentication required.") if token.nil? || token.empty?

    db_exec(
      <<~SQL,
        UPDATE sessions
        SET revoked_at = NOW(),
            updated_at = NOW()
        WHERE token_digest = $1
          AND revoked_at IS NULL
      SQL
      [digest_token(token)]
    )

    JSON.generate(success: true)
  end

  get "/api/auth/me" do
    current = require_authentication!
    JSON.generate(
      user: current[:user],
      expiresAt: current[:expiresAt]
    )
  end

  get "/api/employees" do
    require_manager!

    employees = db_exec(
      <<~SQL
        SELECT id, email, full_name, phone, role, created_at, updated_at
        FROM users
        WHERE role = 'employee'
          AND is_active = TRUE
        ORDER BY created_at DESC
      SQL
    ).map { |row| serialize_user_row(row) }

    JSON.generate(employees: employees)
  end

  post "/api/employees" do
    require_manager!

    payload = parse_json_body
    full_name = sanitize_text(payload["name"], "Name", required: true, max_length: 120)
    email = normalize_email(payload["email"])
    phone = normalize_phone(payload["phone"])
    password = payload["password"].to_s

    if email.empty? || !valid_email?(email)
      halt_json(400, error: "A valid email is required.")
    end
    if phone.empty? || phone.length < 8 || phone.length > 15
      halt_json(400, error: "A valid phone number is required.")
    end
    if password.length < 8
      halt_json(400, error: "Password must be at least 8 characters.")
    end

    duplicate_exists = db_exec(
      "SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    ).first
    if duplicate_exists
      halt_json(409, error: "An employee with this email already exists.")
    end

    password_hash = BCrypt::Password.create(password, cost: BCrypt::Engine::DEFAULT_COST)

    employee = db_exec(
      <<~SQL,
        INSERT INTO users (id, email, full_name, phone, role, password_hash, is_active, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3, 'employee', $4, TRUE, NOW(), NOW())
        RETURNING id, email, full_name, phone, role, created_at, updated_at
      SQL
      [email, full_name, phone, password_hash]
    ).first

    JSON.generate(employee: serialize_user_row(employee))
  end

  get "/api/workspace" do
    current = require_authentication!
    user = current[:user]

    employees = if user[:role] == "manager"
      db_exec(
        <<~SQL
          SELECT id, email, full_name, phone, role, created_at, updated_at
          FROM users
          WHERE role = 'employee'
            AND is_active = TRUE
          ORDER BY created_at DESC
        SQL
      ).map { |row| serialize_user_row(row) }
    else
      db_exec(
        <<~SQL,
          SELECT id, email, full_name, phone, role, created_at, updated_at
          FROM users
          WHERE id = $1
            AND role = 'employee'
            AND is_active = TRUE
          LIMIT 1
        SQL
        [user[:id]]
      ).map { |row| serialize_user_row(row) }
    end

    task_params = []
    task_filter = ""
    if user[:role] != "manager"
      task_filter = "WHERE assignee_id = $1"
      task_params = [user[:id]]
    end
    tasks = db_exec(
      <<~SQL,
        SELECT id,
               title,
               description,
               assignee_id,
               due_at,
               urgency,
               status,
               reminder_every_minutes,
               persistent_reminders,
               next_reminder_at,
               last_reminder_at,
               attachments,
               created_by,
               created_at,
               updated_at,
               completed_at
        FROM tasks
        #{task_filter}
        ORDER BY created_at DESC
      SQL
      task_params
    ).map { |row| serialize_task_row(row) }

    notification_params = []
    notification_filter = ""
    if user[:role] != "manager"
      notification_filter = "WHERE employee_id = $1"
      notification_params = [user[:id]]
    end
    notifications = db_exec(
      <<~SQL,
        SELECT id, employee_id, task_id, type, channel, message, meta, created_at
        FROM notifications
        #{notification_filter}
        ORDER BY created_at DESC
        LIMIT 1000
      SQL
      notification_params
    ).map { |row| serialize_notification_row(row) }

    message_params = []
    message_filter = ""
    if user[:role] != "manager"
      message_filter = "WHERE employee_id = $1"
      message_params = [user[:id]]
    end
    messages = db_exec(
      <<~SQL,
        SELECT id, employee_id, task_id, sender_role, content, created_at
        FROM messages
        #{message_filter}
        ORDER BY created_at ASC
        LIMIT 2000
      SQL
      message_params
    ).map { |row| serialize_message_row(row) }

    vendors = []
    purchase_orders = []
    vendor_alerts = []

    if user[:role] == "manager"
      vendors = db_exec(
        <<~SQL
          SELECT id, name, contact_email, goods, default_cost_price, created_at, updated_at
          FROM vendors
          ORDER BY created_at DESC
        SQL
      ).map { |row| serialize_vendor_row(row) }

      purchase_orders = db_exec(
        <<~SQL
          SELECT id,
                 vendor_id,
                 po_number,
                 goods,
                 quantity,
                 cost_price,
                 raised_at,
                 expected_at,
                 status,
                 created_at
          FROM purchase_orders
          ORDER BY raised_at DESC, created_at DESC
        SQL
      ).map { |row| serialize_purchase_order_row(row) }

      vendor_alerts = db_exec(
        <<~SQL
          SELECT va.id,
                 va.vendor_id,
                 va.po_id,
                 va.priority,
                 va.message,
                 va.created_at,
                 u.email AS sent_by_email
          FROM vendor_alerts va
          LEFT JOIN users u ON u.id = va.sent_by
          ORDER BY va.created_at DESC
          LIMIT 1000
        SQL
      ).map { |row| serialize_vendor_alert_row(row) }
    end

    JSON.generate(
      employees: employees,
      tasks: tasks,
      notifications: notifications,
      messages: messages,
      vendors: vendors,
      purchaseOrders: purchase_orders,
      vendorAlerts: vendor_alerts
    )
  end

  post "/api/tasks" do
    current = require_manager!
    payload = parse_json_body

    title = sanitize_text(payload["title"], "Task title", required: true, max_length: 200)
    description = sanitize_text(payload["description"], "Task description", required: false, max_length: MAX_TEXT_LENGTH)
    assignee_id = payload["assigneeId"].to_s.strip
    halt_json(400, error: "Assignee is required.") if assignee_id.empty?

    assignee = db_exec(
      <<~SQL,
        SELECT id, full_name, phone
        FROM users
        WHERE id = $1
          AND role = 'employee'
          AND is_active = TRUE
        LIMIT 1
      SQL
      [assignee_id]
    ).first
    halt_json(400, error: "Assignee does not exist.") unless assignee

    due_at = parse_timestamp(payload["dueAt"], "task due date")
    urgency = payload["urgency"].to_s.strip
    urgency = "Medium" if urgency.empty?
    unless URGENCY_LEVELS.include?(urgency)
      halt_json(400, error: "Urgency must be one of: #{URGENCY_LEVELS.join(', ')}.")
    end

    reminder_every_minutes = parse_positive_integer(
      payload["reminderEveryMinutes"],
      "Reminder frequency",
      min: 1,
      max: 10080,
      default: 60
    )
    persistent_reminders = parse_boolean(payload["persistentReminders"])
    attachments = sanitize_attachments(payload["attachments"])
    now = Time.now.utc
    next_reminder_at = persistent_reminders ? (now + (reminder_every_minutes * 60)).iso8601 : nil

    task_row = db_exec(
      <<~SQL,
        INSERT INTO tasks (
          id, title, description, assignee_id, due_at, urgency, status,
          reminder_every_minutes, persistent_reminders, next_reminder_at, last_reminder_at,
          attachments, created_by, created_at, updated_at, completed_at
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, 'Pending',
          $6, $7, $8, NULL, $9::jsonb, $10, NOW(), NOW(), NULL
        )
        RETURNING id,
                  title,
                  description,
                  assignee_id,
                  due_at,
                  urgency,
                  status,
                  reminder_every_minutes,
                  persistent_reminders,
                  next_reminder_at,
                  last_reminder_at,
                  attachments,
                  created_by,
                  created_at,
                  updated_at,
                  completed_at
      SQL
      [
        title,
        description,
        assignee_id,
        due_at,
        urgency,
        reminder_every_minutes,
        persistent_reminders,
        next_reminder_at,
        JSON.generate(attachments),
        current[:user][:id]
      ]
    ).first

    task = serialize_task_row(task_row)
    due_for_message = Time.parse(task[:dueAt]).strftime("%Y-%m-%d %H:%M UTC")

    create_notification(
      employee_id: task[:assigneeId],
      task_id: task[:id],
      type: "assignment",
      channel: "app",
      message: "New task assigned: \"#{task[:title]}\" (#{task[:urgency]}) due #{due_for_message}."
    )

    whatsapp_url = build_whatsapp_url(
      phone: assignee["phone"],
      employee_name: assignee["full_name"],
      task_title: task[:title],
      urgency: task[:urgency],
      due_at: due_for_message,
      note: "New task assigned. Please review and acknowledge."
    )
    if whatsapp_url
      create_notification(
        employee_id: task[:assigneeId],
        task_id: task[:id],
        type: "assignment",
        channel: "whatsapp",
        message: "WhatsApp assignment message ready for #{assignee['full_name']}.",
        meta: { url: whatsapp_url }
      )
    end

    JSON.generate(task: task, whatsappUrl: whatsapp_url)
  end

  post "/api/tasks/:task_id/complete" do
    current = require_authentication!
    task = task_row_by_id(params[:task_id])
    halt_json(404, error: "Task not found.") unless task

    if current[:user][:role] != "manager" && task["assignee_id"] != current[:user][:id]
      halt_json(403, error: "You can only complete your own tasks.")
    end

    if task["status"] == "Completed"
      return JSON.generate(task: serialize_task_row(task))
    end

    completed_at = Time.now.utc.iso8601
    updated = db_exec(
      <<~SQL,
        UPDATE tasks
        SET status = 'Completed',
            completed_at = $1,
            next_reminder_at = NULL,
            updated_at = NOW()
        WHERE id = $2
        RETURNING id,
                  title,
                  description,
                  assignee_id,
                  due_at,
                  urgency,
                  status,
                  reminder_every_minutes,
                  persistent_reminders,
                  next_reminder_at,
                  last_reminder_at,
                  attachments,
                  created_by,
                  created_at,
                  updated_at,
                  completed_at
      SQL
      [completed_at, params[:task_id]]
    ).first

    actor = current[:user][:role] == "manager" ? "Manager" : "Employee"
    create_notification(
      employee_id: updated["assignee_id"],
      task_id: updated["id"],
      type: "status",
      channel: "app",
      message: "#{actor} marked \"#{updated['title']}\" as completed."
    )

    JSON.generate(task: serialize_task_row(updated))
  end

  post "/api/tasks/:task_id/reminder" do
    require_manager!
    payload = parse_json_body
    source = payload["source"].to_s.strip.downcase
    source = "manual" unless %w[manual automatic].include?(source)

    task = task_row_by_id(params[:task_id])
    halt_json(404, error: "Task not found.") unless task
    if task["status"] == "Completed"
      halt_json(409, error: "Cannot send reminders for completed tasks.")
    end

    employee = db_exec(
      <<~SQL,
        SELECT id, full_name, phone
        FROM users
        WHERE id = $1
          AND role = 'employee'
          AND is_active = TRUE
        LIMIT 1
      SQL
      [task["assignee_id"]]
    ).first
    halt_json(400, error: "Task assignee is invalid.") unless employee

    due_for_message = Time.parse(task["due_at"]).strftime("%Y-%m-%d %H:%M UTC")
    create_notification(
      employee_id: task["assignee_id"],
      task_id: task["id"],
      type: "reminder",
      channel: "app",
      message: "Reminder: \"#{task['title']}\" remains pending (#{task['urgency']}) and is due #{due_for_message}."
    )

    whatsapp_url = build_whatsapp_url(
      phone: employee["phone"],
      employee_name: employee["full_name"],
      task_title: task["title"],
      urgency: task["urgency"],
      due_at: due_for_message,
      note: "Task reminder: this task is still pending. Please update progress."
    )
    if whatsapp_url
      create_notification(
        employee_id: task["assignee_id"],
        task_id: task["id"],
        type: "reminder",
        channel: "whatsapp",
        message: "WhatsApp reminder ready for #{employee['full_name']}.",
        meta: { url: whatsapp_url, source: source }
      )
    end

    now = Time.now.utc
    reminder_every = task["reminder_every_minutes"].to_i
    next_reminder = if task["persistent_reminders"] == "t" && reminder_every.positive?
      (now + (reminder_every * 60)).iso8601
    else
      nil
    end

    updated = db_exec(
      <<~SQL,
        UPDATE tasks
        SET last_reminder_at = $1,
            next_reminder_at = $2,
            updated_at = NOW()
        WHERE id = $3
        RETURNING id,
                  title,
                  description,
                  assignee_id,
                  due_at,
                  urgency,
                  status,
                  reminder_every_minutes,
                  persistent_reminders,
                  next_reminder_at,
                  last_reminder_at,
                  attachments,
                  created_by,
                  created_at,
                  updated_at,
                  completed_at
      SQL
      [now.iso8601, next_reminder, task["id"]]
    ).first

    JSON.generate(task: serialize_task_row(updated), whatsappUrl: whatsapp_url)
  end

  post "/api/messages" do
    current = require_authentication!
    payload = parse_json_body

    employee_id = payload["employeeId"].to_s.strip
    halt_json(400, error: "Employee selection is required.") if employee_id.empty?

    if current[:user][:role] == "employee" && employee_id != current[:user][:id]
      halt_json(403, error: "Employees can only send messages for themselves.")
    end

    employee = db_exec(
      <<~SQL,
        SELECT id, full_name
        FROM users
        WHERE id = $1
          AND role = 'employee'
          AND is_active = TRUE
        LIMIT 1
      SQL
      [employee_id]
    ).first
    halt_json(400, error: "Selected employee does not exist.") unless employee

    task_id = payload["taskId"].to_s.strip
    task_id = nil if task_id.empty?
    if task_id
      task = task_row_by_id(task_id)
      if !task || task["assignee_id"] != employee_id
        halt_json(400, error: "Selected task does not belong to this employee.")
      end
    end

    content = sanitize_text(payload["content"], "Message content", required: true, max_length: MAX_MESSAGE_LENGTH)
    sender_role = current[:user][:role] == "manager" ? "manager" : "employee"

    message = db_exec(
      <<~SQL,
        INSERT INTO messages (id, employee_id, task_id, sender_role, content, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
        RETURNING id, employee_id, task_id, sender_role, content, created_at
      SQL
      [employee_id, task_id, sender_role, content]
    ).first

    if sender_role == "manager"
      create_notification(
        employee_id: employee_id,
        task_id: task_id,
        type: "message",
        channel: "app",
        message: "Manager message: #{truncate_text(content, 120)}"
      )
    end

    JSON.generate(message: serialize_message_row(message))
  end

  post "/api/vendors" do
    current = require_manager!
    payload = parse_json_body

    name = sanitize_text(payload["name"], "Vendor name", required: true, max_length: 200)
    contact_email = normalize_email(payload["contactEmail"])
    goods = sanitize_goods_list(payload["goods"])
    default_cost_price = parse_non_negative_decimal(payload["defaultCostPrice"], "Default cost price", default: 0.0)

    if !contact_email.empty? && !valid_email?(contact_email)
      halt_json(400, error: "Vendor contact email is invalid.")
    end

    duplicate = db_exec(
      "SELECT 1 FROM vendors WHERE LOWER(name) = LOWER($1) LIMIT 1",
      [name]
    ).first
    if duplicate
      halt_json(409, error: "A vendor with that name already exists.")
    end

    vendor = db_exec(
      <<~SQL,
        INSERT INTO vendors (id, name, contact_email, goods, default_cost_price, created_by, created_at, updated_at)
        VALUES (gen_random_uuid(), $1, $2, $3::jsonb, $4, $5, NOW(), NOW())
        RETURNING id, name, contact_email, goods, default_cost_price, created_at, updated_at
      SQL
      [name, contact_email, JSON.generate(goods), default_cost_price, current[:user][:id]]
    ).first

    JSON.generate(vendor: serialize_vendor_row(vendor))
  end

  post "/api/purchase-orders" do
    current = require_manager!
    payload = parse_json_body

    vendor_id = payload["vendorId"].to_s.strip
    halt_json(400, error: "Vendor is required.") if vendor_id.empty?
    vendor_exists = db_exec(
      "SELECT 1 FROM vendors WHERE id = $1 LIMIT 1",
      [vendor_id]
    ).first
    halt_json(400, error: "Selected vendor does not exist.") unless vendor_exists

    po_number = sanitize_text(payload["poNumber"], "PO number", required: true, max_length: 100)
    goods = sanitize_text(payload["goods"], "PO goods", required: true, max_length: 300)
    quantity = parse_positive_integer(payload["quantity"], "PO quantity", min: 1, max: 1_000_000, default: 1)
    cost_price = parse_non_negative_decimal(payload["costPrice"], "PO cost price")
    raised_at = parse_timestamp(payload["raisedAt"], "PO raised date")
    expected_at = parse_timestamp(payload["expectedAt"], "PO expected date", required: false)

    status = payload["status"].to_s.strip
    status = "Open" if status.empty?
    unless PO_STATUSES.include?(status)
      halt_json(400, error: "PO status must be one of: #{PO_STATUSES.join(', ')}.")
    end

    duplicate = db_exec(
      "SELECT 1 FROM purchase_orders WHERE LOWER(po_number) = LOWER($1) LIMIT 1",
      [po_number]
    ).first
    if duplicate
      halt_json(409, error: "That PO number already exists.")
    end

    purchase_order = db_exec(
      <<~SQL,
        INSERT INTO purchase_orders (
          id, vendor_id, po_number, goods, quantity, cost_price,
          raised_at, expected_at, status, created_by, created_at
        )
        VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5,
          $6, $7, $8, $9, NOW()
        )
        RETURNING id,
                  vendor_id,
                  po_number,
                  goods,
                  quantity,
                  cost_price,
                  raised_at,
                  expected_at,
                  status,
                  created_at
      SQL
      [vendor_id, po_number, goods, quantity, cost_price, raised_at, expected_at, status, current[:user][:id]]
    ).first

    JSON.generate(purchaseOrder: serialize_purchase_order_row(purchase_order))
  end

  post "/api/vendor-alerts" do
    current = require_manager!
    payload = parse_json_body

    vendor_id = payload["vendorId"].to_s.strip
    halt_json(400, error: "Vendor is required.") if vendor_id.empty?
    vendor_exists = db_exec(
      "SELECT 1 FROM vendors WHERE id = $1 LIMIT 1",
      [vendor_id]
    ).first
    halt_json(400, error: "Selected vendor does not exist.") unless vendor_exists

    po_id = payload["poId"].to_s.strip
    po_id = nil if po_id.empty?
    if po_id
      po = db_exec(
        "SELECT vendor_id FROM purchase_orders WHERE id = $1 LIMIT 1",
        [po_id]
      ).first
      if !po || po["vendor_id"] != vendor_id
        halt_json(400, error: "Selected PO does not belong to this vendor.")
      end
    end

    priority = payload["priority"].to_s.strip
    priority = "Medium" if priority.empty?
    unless ALERT_PRIORITIES.include?(priority)
      halt_json(400, error: "Alert priority must be one of: #{ALERT_PRIORITIES.join(', ')}.")
    end
    message = sanitize_text(payload["message"], "Alert message", required: true, max_length: MAX_MESSAGE_LENGTH)

    alert_row = db_exec(
      <<~SQL,
        INSERT INTO vendor_alerts (id, vendor_id, po_id, priority, message, sent_by, created_at)
        VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
        RETURNING id, vendor_id, po_id, priority, message, created_at
      SQL
      [vendor_id, po_id, priority, message, current[:user][:id]]
    ).first

    payload_row = alert_row.to_h
    payload_row["sent_by_email"] = current[:user][:email]

    JSON.generate(vendorAlert: serialize_vendor_alert_row(payload_row))
  end

  not_found do
    if request.path_info.start_with?("/api")
      halt_json(404, error: "Route not found.")
    else
      halt 404, "Not found."
    end
  end

  error do
    error = env["sinatra.error"]
    logger.error(error.message) if error
    if request.path_info.start_with?("/api")
      halt_json(500, error: "Internal server error.")
    else
      halt 500, "Internal server error."
    end
  end
end

if $PROGRAM_NAME == __FILE__
  TaskAssignmentAPI.run!
end