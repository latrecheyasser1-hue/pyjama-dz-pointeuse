import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { getCurrentSessionAndProfile } from './services/authService';
import Navbar from './components/Navbar';
import LoginModal from './components/LoginModal';
import WallQRDisplay from './pages/WallQRDisplay';
import EmployeeScanner from './pages/EmployeeScanner';
import AdminDashboard from './pages/AdminDashboard';
import './App.css';

/**
 * Main Layout component to conditionally hide Navbar and Footer on the pure Wall QR page (/)
 */
function AppLayout({ user, profile, onLogout, onSeedSuccess, onLoginSuccess }) {
  const location = useLocation();
  const isWallQRPage = location.pathname === '/';

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-white">
      
      {/* Hide Navbar completely if on Wall QR Page (/) */}
      {!isWallQRPage && (
        <Navbar
          user={user}
          profile={profile}
          onLogout={onLogout}
          onSeedSuccess={onSeedSuccess}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1">
        <Routes>
          {/* Wall Display: ONLY the QR code and nothing else */}
          <Route path="/" element={<WallQRDisplay />} />

          {/* Employee PWA Scanner */}
          <Route
            path="/scanner"
            element={
              user ? (
                <EmployeeScanner user={user} profile={profile} />
              ) : (
                <LoginModal onSuccess={onLoginSuccess} />
              )
            }
          />

          {/* Admin Dashboard */}
          <Route
            path="/admin"
            element={
              user ? (
                <AdminDashboard user={user} profile={profile} />
              ) : (
                <LoginModal onSuccess={onLoginSuccess} />
              )
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Hide Footer completely if on Wall QR Page (/) */}
      {!isWallQRPage && (
        <footer className="py-6 border-t border-slate-200 bg-slate-50 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 font-medium">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-slate-800">PYJAMA DZ</span>
              <span>— Système de Pointage PWA (TOTP 30s)</span>
            </div>
            <span>Thème Blanc SaaS • Algérie 🇩🇿 2026</span>
          </div>
        </footer>
      )}

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

  const handleSeedSuccess = async () => {
    const res = await getCurrentSessionAndProfile();
    if (res) {
      setUser(res.user);
      setProfile(res.profile);
    }
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
      <AppLayout
        user={user}
        profile={profile}
        onLogout={handleLogout}
        onSeedSuccess={handleSeedSuccess}
        onLoginSuccess={handleLoginSuccess}
      />
    </Router>
  );
}
