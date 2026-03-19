-- ============================================================
-- GRIMZ Admin Security Tables
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. admin_config: key-value store (password hash, settings)
CREATE TABLE IF NOT EXISTS admin_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

-- 2. admin_devices: whitelisted fingerprint + IP combos
CREATE TABLE IF NOT EXISTS admin_devices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fingerprint text NOT NULL,
  ip text NOT NULL,
  label text,
  created_at timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  UNIQUE(fingerprint, ip)
);

-- 3. admin_logs: login attempts (success/fail)
CREATE TABLE IF NOT EXISTS admin_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  fingerprint text,
  ip text,
  action text NOT NULL,
  success boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Index for rate limiting queries (recent fails by IP)
CREATE INDEX IF NOT EXISTS idx_admin_logs_ip_time ON admin_logs (ip, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_devices_fp_ip ON admin_devices (fingerprint, ip);

-- ============================================================
-- RLS Policies (anon role for client-side access)
-- ============================================================

ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

-- admin_config: anon can only read password hash
CREATE POLICY "anon_read_pw_hash" ON admin_config
  FOR SELECT TO anon
  USING (key = 'admin_pw_hash');

-- admin_devices: anon can check, insert, update own devices
CREATE POLICY "anon_select_devices" ON admin_devices
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_insert_devices" ON admin_devices
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_devices" ON admin_devices
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- admin_logs: anon can insert and count recent logs
CREATE POLICY "anon_insert_logs" ON admin_logs
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_select_logs" ON admin_logs
  FOR SELECT TO anon USING (true);

-- service_role has full access (for edge functions)
-- (service_role bypasses RLS by default)
