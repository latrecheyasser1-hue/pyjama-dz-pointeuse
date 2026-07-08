import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { getCurrentSessionAndProfile } from './services/authService';
import WallQRDisplay from './pages/WallQRDisplay';
import EmployeeScanner from './pages/EmployeeScanner';
import AdminDashboard from './pages/AdminDashboard';
import EmployeeLogin from './components/EmployeeLogin';
import AdminLogin from './components/AdminLogin';
import './App.css';

/**
 * Pyjama DZ Pointeuse — 100% Standalone & Isolated Routes
 * Chaque URL est un portail totalement autonome :
 * - / (Root / PWA Start URL) : Redirige automatiquement l'utilisateur connecté vers son espace, ou affiche un menu d'accueil tactile
 * - /QR (ou /qr) : Écran Mural Code QR pur
 * - /employees (ou /scanner) : Portail Employé & Pointage
 * - /admin : Portail Direction & Supervision
 */

function RootRoute({ user, profile }) {
  // If already logged in, redirect straight to their respective portal when PWA launches!
  if (user && profile) {
    if (profile.role === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    if (profile.role === 'employee') {
      return <Navigate to="/employees" replace />;
    }
  }

  // If not logged in, show a modern, touch-friendly portal selection screen for mobile home screen launches
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 text-white font-sans selection:bg-emerald-500 selection:text-white">
      <div className="w-full max-w-md bg-slate-800/90 border border-slate-700 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center backdrop-blur-md">
        {/* Logo / Badge */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-5">
          <span className="text-3xl">🛡️</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white mb-2">
          Pyjama DZ
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm font-medium mb-8 max-w-xs">
          Bienvenue sur l'application de pointage. Choisissez votre espace pour continuer :
        </p>

        {/* Portal Options */}
        <div className="w-full space-y-3.5">
          {/* 1. Espace Employé */}
          <Link
            to="/employees"
            className="w-full flex items-center gap-4 bg-emerald-600 hover:bg-emerald-500 active:scale-98 transition-all p-4 rounded-2xl font-bold text-left shadow-lg shadow-emerald-600/20 border border-emerald-500/50 group"
          >
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              📱
            </div>
            <div className="flex-1">
              <div className="text-base text-white font-black">Espace Employé</div>
              <div className="text-xs text-emerald-100 font-medium">Connexion & Pointage QR</div>
            </div>
            <div className="text-emerald-200 font-bold text-lg">→</div>
          </Link>

          {/* 2. Espace Direction / Admin */}
          <Link
            to="/admin"
            className="w-full flex items-center gap-4 bg-slate-700/80 hover:bg-slate-700 active:scale-98 transition-all p-4 rounded-2xl font-bold text-left border border-slate-600 group"
          >
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              👑
            </div>
            <div className="flex-1">
              <div className="text-base text-white font-black">Espace Direction</div>
              <div className="text-xs text-slate-300 font-medium">Supervision & Bilans</div>
            </div>
            <div className="text-slate-400 font-bold text-lg group-hover:text-white">→</div>
          </Link>

          {/* 3. Écran Mural Code QR */}
          <Link
            to="/QR"
            className="w-full flex items-center gap-4 bg-slate-800/60 hover:bg-slate-700/60 active:scale-98 transition-all p-3.5 rounded-2xl font-bold text-left border border-slate-700/80 text-slate-300 hover:text-white group"
          >
            <div className="w-10 h-10 rounded-lg bg-slate-700/50 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
              📺
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold">Écran Mural Code QR</div>
              <div className="text-[11px] text-slate-400 font-normal">Affichage mural (siège / tablette)</div>
            </div>
          </Link>
        </div>

        <div className="mt-8 text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
          Pyjama DZ — Système PWA v2.6
        </div>
      </div>
    </div>
  );
}

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
        {/* 1. ROOT PATH (PWA SMART LAUNCHER OR REDIRECTOR) */}
        <Route path="/" element={<RootRoute user={user} profile={profile} />} />

        {/* 2. WALL QR CODE DISPLAY (ONLY QR CODE, NOTHING ELSE) */}
        <Route path="/QR" element={<WallQRDisplay />} />
        <Route path="/qr" element={<WallQRDisplay />} />

        {/* 3. EMPLOYEE PORTAL (ONLY PHONE + NAME REGISTRATION / SCANNER) */}
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

        {/* 4. ADMIN PORTAL (ONLY USERNAME + PASSWORD / SUPERVISION) */}
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

        {/* Fallback to Root choice or QR */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
