-- ====================================================================
-- Pyjama DZ Pointeuse: SCRIPT DE SÉCURITÉ & DURCISSEMENT PRODUCTION (RLS)
-- ====================================================================
-- À exécuter dans votre éditeur SQL Supabase (SQL Editor -> New Query)
-- pour verrouiller l'accès de votre base de données contre tout piratage externe.
-- ====================================================================

-- 1. ACTIVER LE ROW LEVEL SECURITY (RLS) SUR TOUTES LES TABLES
ALTER TABLE workplaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

-- 2. SUPPRIMER LES ANCIENNES POLITIQUES OUVERTES (DÉVELOPPEMENT)
DROP POLICY IF EXISTS "Allow read workplaces" ON workplaces;
DROP POLICY IF EXISTS "Allow manage workplaces" ON workplaces;
DROP POLICY IF EXISTS "Allow read profiles" ON profiles;
DROP POLICY IF EXISTS "Allow insert profiles" ON profiles;
DROP POLICY IF EXISTS "Allow update profiles" ON profiles;
DROP POLICY IF EXISTS "Allow delete profiles" ON profiles;
DROP POLICY IF EXISTS "Allow read logs" ON attendance_logs;
DROP POLICY IF EXISTS "Allow insert logs" ON attendance_logs;
DROP POLICY IF EXISTS "Allow update logs" ON attendance_logs;
DROP POLICY IF EXISTS "Allow delete logs" ON attendance_logs;

-- 3. NOUVELLES POLITIQUES SÉCURISÉES : WORKPLACES (LIEUX DE TRAVAIL)
-- Lecture autorisée pour les utilisateurs connectés
CREATE POLICY "Workplaces - Read Authenticated" ON workplaces
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Modification strictement réservée aux administrateurs
CREATE POLICY "Workplaces - Manage Admin Only" ON workplaces
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 4. NOUVELLES POLITIQUES SÉCURISÉES : PROFILES (EMPLOYÉS & DIRECTION)
-- Lecture des profils autorisée pour les utilisateurs authentifiés
CREATE POLICY "Profiles - Read Authenticated" ON profiles
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Inscription / Création de profil permise lors de l'authentification Supabase
CREATE POLICY "Profiles - Insert Self or Admin" ON profiles
    FOR INSERT WITH CHECK (
        id = auth.uid() OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Mise à jour : l'utilisateur peut modifier son propre profil (ex: appareil lié), l'admin peut tout modifier
CREATE POLICY "Profiles - Update Self or Admin" ON profiles
    FOR UPDATE USING (
        id = auth.uid() OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- Suppression réservée aux administrateurs
CREATE POLICY "Profiles - Delete Admin Only" ON profiles
    FOR DELETE USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );

-- 5. NOUVELLES POLITIQUES SÉCURISÉES : ATTENDANCE_LOGS (POINTAGES)
-- Lecture : l'employé voit ses propres pointages, l'admin/manager voit tous les pointages
CREATE POLICY "Attendance - Read Self or Admin" ON attendance_logs
    FOR SELECT USING (
        employee_id = auth.uid() OR
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
    );

-- Insertion : l'employé ne peut enregistrer un pointage QUE pour son propre ID utilisateur
CREATE POLICY "Attendance - Insert Self Only" ON attendance_logs
    FOR INSERT WITH CHECK (
        employee_id = auth.uid() AND auth.uid() IS NOT NULL
    );

-- Modification/Suppression des logs réservée à la direction (Admin / Manager)
CREATE POLICY "Attendance - Modify Admin Only" ON attendance_logs
    FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
    );

-- ====================================================================
-- VÉRIFICATION : AFFICHER LE STATUT RLS ACTUEL
-- ====================================================================
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename IN ('workplaces', 'profiles', 'attendance_logs');
