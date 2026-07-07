import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { logoutUser, seedDemoAccounts } from '../services/authService';
import { QrCode, Smartphone, LayoutDashboard, LogOut, Sparkles, User, ShieldCheck } from 'lucide-react';

export default function Navbar({ user, profile, onLogout, onSeedSuccess }) {
  const location = useLocation();
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState(null);

  const handleLogout = async () => {
    await logoutUser();
    if (onLogout) onLogout();
  };

  const handleSeed = async () => {
    setSeeding(true);
    setSeedMsg(null);
    try {
      const res = await seedDemoAccounts();
      setSeedMsg('⚡ Comptes démo prêts ! (yasser@pyjamadz.com & admin@pyjamadz.com)');
      if (onSeedSuccess) onSeedSuccess();
    } catch (err) {
      setSeedMsg('Erreur lors de la création des démos.');
    } finally {
      setSeeding(false);
      setTimeout(() => setSeedMsg(null), 5000);
    }
  };

  const navLinks = [
    { path: '/', label: 'Écran Mural QR', icon: <QrCode className="w-5 h-5" /> },
    { path: '/scanner', label: 'Scanner Mobile (PWA)', icon: <Smartphone className="w-5 h-5" /> },
  ];

  if (profile?.role === 'admin' || profile?.role === 'manager') {
    navLinks.push({
      path: '/admin',
      label: 'Tableau de Bord Admin',
      icon: <LayoutDashboard className="w-5 h-5" />
    });
  }

  return (
    <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Brand Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:scale-105 transition-transform duration-200">
              <QrCode className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold bg-gradient-to-r from-emerald-400 via-teal-300 to-indigo-400 bg-clip-text text-transparent">
                PYJAMA DZ
              </span>
              <span className="block text-xs text-slate-400 font-medium tracking-wider uppercase">
                Pointeuse Dynamique
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.path;
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  {link.icon}
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {/* User Profile & Quick Actions */}
          <div className="flex items-center gap-3">
            
            {/* Seed Demo Button */}
            {!user && (
              <button
                onClick={handleSeed}
                disabled={seeding}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 transition-all shadow-sm"
                title="Génère ou vérifie les comptes de test instantanés"
              >
                <Sparkles className="w-3.5 h-3.5 animate-pulse text-indigo-400" />
                {seeding ? 'Chargement...' : 'Démo / Seed'}
              </button>
            )}

            {/* User Badge if logged in */}
            {user ? (
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                    {profile?.full_name || user.email.split('@')[0]}
                    {profile?.role === 'admin' && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 rounded uppercase tracking-wider">
                        Admin
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    {profile?.bound_device_id ? 'Appareil Lié' : 'Non Lié'}
                  </span>
                </div>

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 hover:text-red-300 border border-transparent hover:border-red-500/20 transition-all"
                  title="Se déconnecter"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Quitter</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium px-2 py-1 bg-slate-800 rounded border border-slate-700">
                  Mode Visiteur / Mural
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="md:hidden flex items-center justify-around py-2 border-t border-slate-800">
          {navLinks.map((link) => {
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`flex flex-col items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'text-emerald-400 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {link.icon}
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Toast notification for Seeding */}
      {seedMsg && (
        <div className="bg-gradient-to-r from-indigo-600 to-emerald-600 text-white text-xs font-semibold py-1.5 px-4 text-center shadow-md animate-fade-in">
          {seedMsg}
        </div>
      )}
    </header>
  );
}
