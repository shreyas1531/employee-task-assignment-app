ALTER TABLE users
  ADD COLUMN IF NOT EXISTS phone_number TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'General';

UPDATE users
SET phone_number = NULLIF(REGEXP_REPLACE(COALESCE(phone, ''), '\D', '', 'g'), '')
WHERE phone_number IS NULL;

ALTER TABLE users
  ADD CONSTRAINT users_phone_number_format_check
  CHECK (
    phone_number IS NULL
    OR phone_number ~ '^\+?[1-9][0-9]{7,14}$'
  );

CREATE INDEX IF NOT EXISTS users_department_idx ON users (LOWER(department));

CREATE TABLE IF NOT EXISTS whatsapp_notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  template_key TEXT NOT NULL CHECK (char_length(template_key) BETWEEN 1 AND 80),
  dedupe_key TEXT NOT NULL CHECK (char_length(dedupe_key) BETWEEN 1 AND 200),
  message_payload JSONB NOT NULL CHECK (jsonb_typeof(message_payload) = 'object'),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'failed', 'cancelled')),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries INTEGER NOT NULL DEFAULT 3 CHECK (max_retries BETWEEN 0 AND 10),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ,
  provider_message_sid TEXT,
  last_error TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_notification_queue_dedupe_unique_idx
  ON whatsapp_notification_queue (dedupe_key);
CREATE INDEX IF NOT EXISTS whatsapp_notification_queue_status_next_attempt_idx
  ON whatsapp_notification_queue (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS whatsapp_notification_queue_employee_created_idx
  ON whatsapp_notification_queue (employee_id, created_at DESC);

CREATE TABLE IF NOT EXISTS whatsapp_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID REFERENCES whatsapp_notification_queue(id) ON DELETE SET NULL,
  employee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  template_key TEXT NOT NULL CHECK (char_length(template_key) BETWEEN 1 AND 80),
  message_text TEXT NOT NULL CHECK (char_length(message_text) BETWEEN 1 AND 2000),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  provider_message_sid TEXT,
  error_message TEXT,
  metadata JSONB CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_delivery_logs_created_idx
  ON whatsapp_delivery_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_delivery_logs_employee_idx
  ON whatsapp_delivery_logs (employee_id, created_at DESC);

CREATE TABLE IF NOT EXISTS performance_scoring_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  on_time_completion_weight INTEGER NOT NULL DEFAULT 10,
  late_completion_weight INTEGER NOT NULL DEFAULT 5,
  pending_overdue_weight INTEGER NOT NULL DEFAULT -8,
  unfinished_weight INTEGER NOT NULL DEFAULT -10,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO performance_scoring_weights (
  id,
  on_time_completion_weight,
  late_completion_weight,
  pending_overdue_weight,
  unfinished_weight,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  10,
  5,
  -8,
  -10,
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM performance_scoring_weights);

CREATE TABLE IF NOT EXISTS employee_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK (period_type IN ('weekly', 'monthly', 'all_time')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  tasks_completed_on_time INTEGER NOT NULL DEFAULT 0,
  late_completed_tasks INTEGER NOT NULL DEFAULT 0,
  overdue_tasks INTEGER NOT NULL DEFAULT 0,
  pending_tasks INTEGER NOT NULL DEFAULT 0,
  cancelled_tasks INTEGER NOT NULL DEFAULT 0,
  completion_percentage NUMERIC(6, 2) NOT NULL DEFAULT 0,
  average_completion_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT 'D' CHECK (grade IN ('A+', 'A', 'B', 'C', 'D')),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS employee_performance_snapshots_emp_period_idx
  ON employee_performance_snapshots (employee_id, period_type, period_start DESC);

CREATE TABLE IF NOT EXISTS performance_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month TEXT NOT NULL CHECK (char_length(period_month) BETWEEN 7 AND 7),
  generated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  report_data JSONB NOT NULL CHECK (jsonb_typeof(report_data) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS performance_reports_month_idx
  ON performance_reports (period_month, created_at DESC);

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS minimum_stock_threshold INTEGER NOT NULL DEFAULT 0 CHECK (minimum_stock_threshold >= 0),
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT '';

UPDATE products
SET sku = item_code
WHERE (sku IS NULL OR sku = '') AND item_code IS NOT NULL AND item_code <> '';

ALTER TABLE products
  ADD CONSTRAINT products_status_check
  CHECK (status IN ('Active', 'Inactive', 'Discontinued'));

CREATE UNIQUE INDEX IF NOT EXISTS products_sku_lower_unique_idx ON products (LOWER(sku));
CREATE INDEX IF NOT EXISTS products_min_stock_idx ON products (minimum_stock_threshold);
CREATE INDEX IF NOT EXISTS products_status_idx ON products (status);

CREATE TABLE IF NOT EXISTS product_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('stock_in', 'stock_out', 'adjustment', 'po_delivery', 'order_fulfillment')),
  quantity_change INTEGER NOT NULL,
  previous_quantity INTEGER NOT NULL,
  new_quantity INTEGER NOT NULL CHECK (new_quantity >= 0),
  reference_type TEXT NOT NULL DEFAULT '' CHECK (char_length(reference_type) <= 80),
  reference_id UUID,
  notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_stock_movements_product_created_idx
  ON product_stock_movements (product_id, created_at DESC);

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS subtotal_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (subtotal_amount >= 0),
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  ADD COLUMN IF NOT EXISTS grand_total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (grand_total_amount >= 0),
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

UPDATE purchase_orders
SET subtotal_amount = COALESCE(subtotal_amount, total_amount, (quantity::numeric * COALESCE(unit_price, cost_price, 0))),
    grand_total_amount = COALESCE(grand_total_amount, total_amount, (quantity::numeric * COALESCE(unit_price, cost_price, 0))),
    tax_amount = COALESCE(tax_amount, 0);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  item_code TEXT NOT NULL CHECK (char_length(item_code) BETWEEN 1 AND 80),
  product_name TEXT NOT NULL CHECK (char_length(product_name) BETWEEN 1 AND 200),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS purchase_order_items_po_idx ON purchase_order_items (purchase_order_id);
CREATE INDEX IF NOT EXISTS purchase_order_items_product_idx ON purchase_order_items (product_id);
