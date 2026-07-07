import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { getCurrentSessionAndProfile } from './services/authService';
import Navbar from './components/Navbar';
import LoginModal from './components/LoginModal';
import WallQRDisplay from './pages/WallQRDisplay';
import EmployeeScanner from './pages/EmployeeScanner';
import AdminDashboard from './pages/AdminDashboard';
import './App.css';

export default function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load initial session & profile
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

  const handleLogout = () => {
    setSession(null);
    setUser(null);
    setProfile(null);
  };

  const handleSeedSuccess = async () => {
    // Reload profile if needed
    const res = await getCurrentSessionAndProfile();
    if (res) {
      setUser(res.user);
      setProfile(res.profile);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 text-white">
        <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
        <p className="text-slate-400 text-sm font-semibold animate-pulse">
          Initialisation de Pyjama DZ Pointeuse...
        </p>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased selection:bg-emerald-500 selection:text-white">
        
        {/* Responsive Navbar */}
        <Navbar
          user={user}
          profile={profile}
          onLogout={handleLogout}
          onSeedSuccess={handleSeedSuccess}
        />

        {/* Main Routing Content */}
        <main className="flex-1 pb-12">
          <Routes>
            {/* Wall Display: Publicly accessible or for Admin/Terminal */}
            <Route path="/" element={<WallQRDisplay />} />

            {/* Employee PWA Scanner */}
            <Route
              path="/scanner"
              element={
                user ? (
                  <EmployeeScanner user={user} profile={profile} />
                ) : (
                  <LoginModal onSuccess={handleLoginSuccess} />
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
                  <LoginModal onSuccess={handleLoginSuccess} />
                )
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="py-6 border-t border-slate-900 bg-slate-950/80 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-400">PYJAMA DZ</span>
              <span>— Système de Pointage Dynamique & Anti-Fraude</span>
            </div>
            <span>Conçu avec excellence • Algérie 🇩🇿 2026</span>
          </div>
        </footer>

      </div>
    </Router>
  );
}
