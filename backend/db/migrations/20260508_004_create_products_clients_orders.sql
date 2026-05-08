CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  item_code TEXT NOT NULL CHECK (char_length(item_code) BETWEEN 1 AND 80),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  category TEXT NOT NULL DEFAULT '' CHECK (char_length(category) <= 120),
  stock_status TEXT NOT NULL CHECK (stock_status IN ('In Stock', 'Low Stock', 'Out of Stock')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS products_item_code_lower_unique_idx ON products (LOWER(item_code));
CREATE INDEX IF NOT EXISTS products_vendor_idx ON products (vendor_id);
CREATE INDEX IF NOT EXISTS products_stock_status_idx ON products (stock_status);
CREATE INDEX IF NOT EXISTS products_name_search_idx ON products (LOWER(name));

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS clients_name_lower_unique_idx ON clients (LOWER(name));
CREATE INDEX IF NOT EXISTS clients_city_idx ON clients (LOWER(city));
CREATE INDEX IF NOT EXISTS clients_status_idx ON clients (status);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL CHECK (char_length(order_number) BETWEEN 1 AND 80),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  due_at TIMESTAMPTZ NOT NULL,
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('Pending', 'Processing', 'Delivered', 'Cancelled')),
  assigned_employee_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_lower_unique_idx ON orders (LOWER(order_number));
CREATE INDEX IF NOT EXISTS orders_due_at_idx ON orders (due_at);
CREATE INDEX IF NOT EXISTS orders_delivery_status_idx ON orders (delivery_status);
CREATE INDEX IF NOT EXISTS orders_assigned_employee_idx ON orders (assigned_employee_id);
