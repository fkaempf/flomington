-- supabase/schema.sql
-- Run this in Supabase SQL Editor to create all tables

CREATE TABLE IF NOT EXISTS stocks (
  id text PRIMARY KEY,
  name text NOT NULL,
  genotype text,
  variant text DEFAULT 'stock',
  category text,
  location text DEFAULT '25inc',
  source text,
  source_id text,
  flybase_id text,
  janelia_line text,
  maintainer text,
  notes text,
  is_gift boolean DEFAULT false,
  gift_from text,
  copies integer DEFAULT 1,
  created_at timestamptz,
  last_flipped timestamptz,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crosses (
  id text PRIMARY KEY,
  parent_a text,
  parent_b text,
  owner text NOT NULL,
  cross_type text DEFAULT 'simple',
  parent_cross_id text,
  temperature text,
  setup_date timestamptz,
  status text NOT NULL DEFAULT 'set up',
  target_count integer,
  collected jsonb DEFAULT '[]',
  vials jsonb DEFAULT '[]',
  virgins_collected integer DEFAULT 0,
  manual_flip_date timestamptz,
  manual_eclose_date timestamptz,
  manual_virgin_date timestamptz,
  experiment_type text,
  experiment_date timestamptz,
  retinal_start_date timestamptz,
  wait_start_date timestamptz,
  ripening_start_date timestamptz,
  notes text,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pins (
  user_name text PRIMARY KEY,
  hash text NOT NULL
);

CREATE TABLE IF NOT EXISTS virgin_banks (
  user_name text NOT NULL,
  stock_id text NOT NULL,
  count integer DEFAULT 0,
  PRIMARY KEY (user_name, stock_id)
);

CREATE TABLE IF NOT EXISTS transfers (
  id text PRIMARY KEY,
  type text NOT NULL,
  item_id text,
  from_user text NOT NULL,
  to_user text NOT NULL,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS collections (
  name text PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stocks_updated_at BEFORE UPDATE ON stocks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER crosses_updated_at BEFORE UPDATE ON crosses FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE stocks;
ALTER PUBLICATION supabase_realtime ADD TABLE crosses;
ALTER PUBLICATION supabase_realtime ADD TABLE pins;
ALTER PUBLICATION supabase_realtime ADD TABLE virgin_banks;
ALTER PUBLICATION supabase_realtime ADD TABLE transfers;
ALTER PUBLICATION supabase_realtime ADD TABLE collections;

-- Allow anonymous access (app uses shared password via StatiCrypt, not Supabase auth)
ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE crosses ENABLE ROW LEVEL SECURITY;
ALTER TABLE pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE virgin_banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON stocks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON crosses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON pins FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON virgin_banks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON transfers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON collections FOR ALL USING (true) WITH CHECK (true);
