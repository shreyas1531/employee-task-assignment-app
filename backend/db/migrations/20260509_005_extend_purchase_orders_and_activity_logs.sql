ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS product_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS item_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  ADD COLUMN IF NOT EXISTS order_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS expected_delivery_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_employee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 5000),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE purchase_orders
SET unit_price = CASE WHEN unit_price = 0 THEN cost_price ELSE unit_price END,
    total_amount = CASE WHEN total_amount = 0 THEN ROUND((quantity::numeric * cost_price)::numeric, 2) ELSE total_amount END,
    order_date = COALESCE(order_date, raised_at, NOW()),
    expected_delivery_date = COALESCE(expected_delivery_date, expected_at),
    status = CASE status
      WHEN 'Open' THEN 'Draft'
      WHEN 'Partially Received' THEN 'In Transit'
      WHEN 'Received' THEN 'Delivered'
      WHEN 'Delayed' THEN 'In Transit'
      ELSE status
    END,
    updated_at = NOW();

ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_status_check;

ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_status_check CHECK (
    status IN ('Draft', 'Approved', 'Ordered', 'In Transit', 'Delivered', 'Cancelled')
  );

CREATE INDEX IF NOT EXISTS purchase_orders_status_idx ON purchase_orders (status);
CREATE INDEX IF NOT EXISTS purchase_orders_expected_delivery_idx ON purchase_orders (expected_delivery_date);
CREATE INDEX IF NOT EXISTS purchase_orders_assigned_employee_idx ON purchase_orders (assigned_employee_id);

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK (char_length(actor_role) BETWEEN 1 AND 40),
  action TEXT NOT NULL CHECK (char_length(action) BETWEEN 1 AND 120),
  entity_type TEXT NOT NULL CHECK (char_length(entity_type) BETWEEN 1 AND 80),
  entity_id UUID,
  details JSONB CHECK (details IS NULL OR jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_logs_created_idx ON activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_logs_entity_idx ON activity_logs (entity_type, entity_id, created_at DESC);
