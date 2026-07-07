import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { QrCode, Smartphone, ShieldCheck, LogOut, Sparkles, UserCheck } from 'lucide-react';
import { seedDemoAccounts } from '../services/authService';

export default function Navbar({ user, profile, onLogout, onSeedSuccess }) {
  const location = useLocation();

  const handleSeed = async () => {
    try {
      await seedDemoAccounts();
      if (onSeedSuccess) onSeedSuccess();
      alert('✨ Comptes de test initialisés dans la base Supabase !');
    } catch (e) {
      console.error(e);
    }
  };

  const isActive = (path) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <Link to="/scanner" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                <span className="font-black text-lg tracking-wider">DZ</span>
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-slate-900 tracking-tight text-base sm:text-lg">
                  PYJAMA <span className="text-emerald-600">POINTEUSE</span>
                </span>
                <span className="text-[10px] font-semibold text-slate-500 -mt-1 uppercase tracking-wider">
                  Système PWA
                </span>
              </div>
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <Link
              to="/"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/')
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <QrCode className="w-4 h-4 text-emerald-600" />
              <span>Écran Mural</span>
            </Link>

            <Link
              to="/scanner"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/scanner')
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Smartphone className="w-4 h-4 text-teal-600" />
              <span>Scanner Employé</span>
            </Link>

            <Link
              to="/admin"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                isActive('/admin')
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <span>Administration</span>
            </Link>
          </nav>

          {/* Right Section: User Profile & Seed Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSeed}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-all shadow-sm"
              title="Créer comptes de test par défaut"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Démo / Seed</span>
            </button>

            {user ? (
              <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-bold text-slate-800 leading-tight">
                    {profile?.full_name || 'Utilisateur'}
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">
                    {profile?.role === 'admin' ? '👑 Administrateur' : '📱 Employé'}
                  </span>
                </div>
                <button
                  onClick={onLogout}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-200"
                  title="Se déconnecter"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link
                to="/scanner"
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md"
              >
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span>Connexion</span>
              </Link>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}
