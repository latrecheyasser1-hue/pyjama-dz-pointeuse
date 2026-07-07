import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { getCurrentSessionAndProfile } from './services/authService';
import WallQRDisplay from './pages/WallQRDisplay';
import EmployeeScanner from './pages/EmployeeScanner';
import AdminDashboard from './pages/AdminDashboard';
import EmployeeLogin from './components/EmployeeLogin';
import AdminLogin from './components/AdminLogin';
import './App.css';

/**
 * Pyjama DZ Pointeuse — 100% Standalone & Isolated Routes
 * Aucune barre de navigation commune (No Navbar), aucun onglet de basculement.
 * Chaque URL est un portail totalement autonome :
 * - /QR (ou /qr, /) : Écran Mural Code QR pur
 * - /employees (ou /scanner) : Portail Matures & Pointage Employé
 * - /admin : Portail Direction & Supervision
 */
export default function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initAuth() {
      setLoading(true);
      try {
        const res = await getCurrentSessionAndProfile();
        if (res) {
          setSession(res.session);
          setUser(res.user);
          setProfile(res.profile);
        }
      } catch (e) {
        console.error('Auth init error:', e);
      } finally {
        setLoading(false);
      }
    }
    initAuth();
  }, []);

  const handleLoginSuccess = (loggedInUser, userProfile) => {
    setUser(loggedInUser);
    setProfile(userProfile);
  };

  const handleLogout = async () => {
    const { logoutUser } = await import('./services/authService');
    await logoutUser();
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 text-slate-900 font-sans">
        <div className="w-12 h-12 border-4 border-emerald-600/30 border-t-emerald-600 rounded-full animate-spin"></div>
        <p className="text-slate-600 text-sm font-bold animate-pulse">
          Chargement de Pyjama DZ Pointeuse...
        </p>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* 1. WALL QR CODE DISPLAY (ONLY QR CODE, NOTHING ELSE) */}
        <Route path="/" element={<WallQRDisplay />} />
        <Route path="/QR" element={<WallQRDisplay />} />
        <Route path="/qr" element={<WallQRDisplay />} />

        {/* 2. EMPLOYEE PORTAL (ONLY PHONE + NAME REGISTRATION / SCANNER) */}
        <Route
          path="/employees"
          element={
            user ? (
              <EmployeeScanner user={user} profile={profile} onLogout={handleLogout} />
            ) : (
              <EmployeeLogin onSuccess={handleLoginSuccess} />
            )
          }
        />
        <Route path="/scanner" element={<Navigate to="/employees" replace />} />

        {/* 3. ADMIN PORTAL (ONLY USERNAME + PASSWORD / SUPERVISION) */}
        <Route
          path="/admin"
          element={
            user ? (
              <AdminDashboard user={user} profile={profile} onLogout={handleLogout} />
            ) : (
              <AdminLogin onSuccess={handleLoginSuccess} />
            )
          }
        />

        {/* Fallback to QR display */}
        <Route path="*" element={<Navigate to="/QR" replace />} />
      </Routes>
    </Router>
  );
}
