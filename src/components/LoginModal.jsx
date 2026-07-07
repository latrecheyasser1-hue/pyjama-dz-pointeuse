import React, { useState } from 'react';
import { loginUser, seedDemoAccounts } from '../services/authService';
import { Lock, Mail, KeyRound, Sparkles, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function LoginModal({ onSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { user, profile } = await loginUser(email, password);
      if (onSuccess) onSuccess(user, profile);
    } catch (err) {
      setError(err.message || 'Erreur d\'authentification.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  const handleSeed = async () => {
    setSeeding(true);
    setSeedSuccess(null);
    setError(null);
    try {
      const res = await seedDemoAccounts();
      setSeedSuccess('Comptes de démonstration initialisés et prêts à l\'emploi !');
    } catch (err) {
      setError('Impossible de créer les comptes démo. Vérifiez la connexion Supabase.');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 p-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent"></div>
          <div className="w-16 h-16 bg-slate-900/80 backdrop-blur-md rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-xl border border-white/10">
            <Lock className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Connexion au Système
          </h2>
          <p className="text-sm text-emerald-100/80 mt-1 font-medium">
            Pointeuse Sécurisée Pyjama DZ
          </p>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          
          {/* Quick Demo Test Buttons */}
          <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                Accès Test Instantané
              </span>
              <button
                type="button"
                onClick={handleSeed}
                disabled={seeding}
                className="text-[11px] font-medium text-indigo-400 hover:text-indigo-300 underline transition-colors"
              >
                {seeding ? 'Création...' : 'Réinitialiser Démos'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('yasser@pyjamadz.com', 'pyjamadz2026')}
                className="flex flex-col items-start p-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-left transition-all group"
              >
                <span className="text-xs font-bold text-emerald-400 group-hover:translate-x-0.5 transition-transform">
                  📱 Employé Test
                </span>
                <span className="text-[10px] text-slate-400 truncate w-full mt-0.5">
                  yasser@pyjamadz.com
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('admin@pyjamadz.com', 'pyjamadz2026')}
                className="flex flex-col items-start p-2.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-left transition-all group"
              >
                <span className="text-xs font-bold text-indigo-400 group-hover:translate-x-0.5 transition-transform">
                  👑 Admin Test
                </span>
                <span className="text-[10px] text-slate-400 truncate w-full mt-0.5">
                  admin@pyjamadz.com
                </span>
              </button>
            </div>
          </div>

          {/* Feedback Messages */}
          {seedSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg flex items-center gap-2 text-emerald-300 text-xs font-medium animate-fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{seedSuccess}</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2 text-red-300 text-xs font-medium animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Adresse Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nom@pyjamadz.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Mot de Passe
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-600 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>Se Connecter</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Security Notice */}
          <div className="pt-2 border-t border-slate-800 text-center">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              🔒 <strong className="text-slate-400">Anti-Fraude Actif :</strong> Lors de votre première connexion, votre smartphone sera lié de manière définitive à votre matricule.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
