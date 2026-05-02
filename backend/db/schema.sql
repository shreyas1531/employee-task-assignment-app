CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('manager', 'employee');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role user_role NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique_idx ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 5000),
  assignee_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  due_at TIMESTAMPTZ NOT NULL,
  urgency TEXT NOT NULL CHECK (urgency IN ('Low', 'Medium', 'High', 'Critical')),
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Completed')),
  reminder_every_minutes INTEGER NOT NULL DEFAULT 60 CHECK (reminder_every_minutes BETWEEN 1 AND 10080),
  persistent_reminders BOOLEAN NOT NULL DEFAULT TRUE,
  next_reminder_at TIMESTAMPTZ,
  last_reminder_at TIMESTAMPTZ,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(attachments) = 'array'),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tasks_assignee_id_idx ON tasks (assignee_id);
CREATE INDEX IF NOT EXISTS tasks_due_at_idx ON tasks (due_at);
CREATE INDEX IF NOT EXISTS tasks_status_idx ON tasks (status);
CREATE INDEX IF NOT EXISTS tasks_next_reminder_idx ON tasks (next_reminder_at);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (char_length(type) BETWEEN 1 AND 40),
  channel TEXT NOT NULL CHECK (channel IN ('app', 'whatsapp')),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  meta JSONB CHECK (meta IS NULL OR jsonb_typeof(meta) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_employee_created_idx
  ON notifications (employee_id, created_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  sender_role user_role NOT NULL,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_employee_created_idx
  ON messages (employee_id, created_at ASC);

CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  contact_email TEXT NOT NULL DEFAULT '',
  goods JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(goods) = 'array'),
  default_cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (default_cost_price >= 0),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS vendors_name_lower_unique_idx ON vendors (LOWER(name));

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  po_number TEXT NOT NULL CHECK (char_length(po_number) BETWEEN 1 AND 100),
  goods TEXT NOT NULL CHECK (char_length(goods) BETWEEN 1 AND 300),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 1000000),
  cost_price NUMERIC(12, 2) NOT NULL CHECK (cost_price >= 0),
  raised_at TIMESTAMPTZ NOT NULL,
  expected_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('Open', 'Partially Received', 'Received', 'Delayed', 'Cancelled')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_number_lower_unique_idx
  ON purchase_orders (LOWER(po_number));
CREATE INDEX IF NOT EXISTS purchase_orders_vendor_idx ON purchase_orders (vendor_id);
CREATE INDEX IF NOT EXISTS purchase_orders_created_idx ON purchase_orders (created_at DESC);

CREATE TABLE IF NOT EXISTS vendor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  priority TEXT NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  sent_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vendor_alerts_vendor_created_idx
  ON vendor_alerts (vendor_id, created_at DESC);
