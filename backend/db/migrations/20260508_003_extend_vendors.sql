ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS contact_phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active';

ALTER TABLE vendors
  DROP CONSTRAINT IF EXISTS vendors_status_check;

ALTER TABLE vendors
  ADD CONSTRAINT vendors_status_check
  CHECK (status IN ('Active', 'Inactive'));

CREATE INDEX IF NOT EXISTS vendors_city_idx ON vendors (LOWER(city));
CREATE INDEX IF NOT EXISTS vendors_status_idx ON vendors (status);
