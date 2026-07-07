-- ====================================================================
-- Pyjama DZ Pointeuse: Supabase SQL Schema & RLS Policies
-- ====================================================================

-- 1. EXTENSIONS & TYPES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
    CREATE TYPE employee_status AS ENUM ('pending', 'active', 'suspended');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE attendance_action AS ENUM ('check_in', 'check_out');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. TABLES
CREATE TABLE IF NOT EXISTS workplaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    qr_secret VARCHAR(255) NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    workplace_id UUID REFERENCES workplaces(id) ON DELETE SET NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(50) DEFAULT 'employee' CHECK (role IN ('admin', 'manager', 'employee')),
    status employee_status NOT NULL DEFAULT 'pending',
    bound_device_id VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    workplace_id UUID NOT NULL REFERENCES workplaces(id) ON DELETE CASCADE,
    action_type attendance_action NOT NULL,
    scan_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    device_fingerprint VARCHAR(255) NOT NULL,
    qr_token_used VARCHAR(255) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON attendance_logs (employee_id, scan_time DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_workplace_date ON attendance_logs (workplace_id, scan_time DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles (status);

-- 4. VIEWS
CREATE OR REPLACE VIEW daily_attendance_summary AS
WITH numbered_logs AS (
    SELECT 
        id,
        employee_id,
        workplace_id,
        action_type,
        scan_time,
        DATE(scan_time AT TIME ZONE 'UTC') AS work_date,
        ROW_NUMBER() OVER (PARTITION BY employee_id, DATE(scan_time AT TIME ZONE 'UTC') ORDER BY scan_time ASC) as seq_num
    FROM attendance_logs
),
paired_logs AS (
    SELECT 
        in_log.employee_id,
        in_log.workplace_id,
        in_log.work_date,
        in_log.scan_time AS check_in_time,
        out_log.scan_time AS check_out_time,
        CASE 
            WHEN out_log.scan_time IS NOT NULL THEN 
                EXTRACT(EPOCH FROM (out_log.scan_time - in_log.scan_time)) / 3600.0
            ELSE 0 
        END AS hours_worked
    FROM numbered_logs in_log
    LEFT JOIN numbered_logs out_log 
        ON in_log.employee_id = out_log.employee_id 
        AND in_log.work_date = out_log.work_date
        AND out_log.seq_num = in_log.seq_num + 1
        AND out_log.action_type = 'check_out'
    WHERE in_log.action_type = 'check_in'
)
SELECT 
    employee_id,
    workplace_id,
    work_date,
    MIN(check_in_time) AS first_check_in,
    MAX(check_out_time) AS last_check_out,
    COUNT(*) AS total_sessions,
    ROUND(SUM(hours_worked)::numeric, 2) AS total_hours_worked,
    CASE 
        WHEN COUNT(*) * 2 != (SELECT COUNT(*) FROM attendance_logs WHERE employee_id = paired_logs.employee_id AND DATE(scan_time AT TIME ZONE 'UTC') = paired_logs.work_date)
        THEN true ELSE false 
    END AS is_incomplete_shift
FROM paired_logs
GROUP BY employee_id, workplace_id, work_date;

-- 5. RLS POLICIES
ALTER TABLE workplaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY "Allow read workplaces" ON workplaces FOR SELECT USING (true);
    CREATE POLICY "Allow manage workplaces" ON workplaces FOR ALL USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow read profiles" ON profiles FOR SELECT USING (true);
    CREATE POLICY "Allow insert profiles" ON profiles FOR INSERT WITH CHECK (true);
    CREATE POLICY "Allow update profiles" ON profiles FOR UPDATE USING (true);
    CREATE POLICY "Allow delete profiles" ON profiles FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE POLICY "Allow read logs" ON attendance_logs FOR SELECT USING (true);
    CREATE POLICY "Allow insert logs" ON attendance_logs FOR INSERT WITH CHECK (true);
    CREATE POLICY "Allow update logs" ON attendance_logs FOR UPDATE USING (true);
    CREATE POLICY "Allow delete logs" ON attendance_logs FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 6. INITIAL WORKPLACE SEED
INSERT INTO workplaces (name, qr_secret)
SELECT 'Siège Principal Alger - Pyjama DZ', 'dz_secret_key_2026_alger_pointeuse_totp'
WHERE NOT EXISTS (SELECT 1 FROM workplaces WHERE name = 'Siège Principal Alger - Pyjama DZ');
