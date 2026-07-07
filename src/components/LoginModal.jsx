import React, { useState } from 'react';
import { loginAdminUsername, loginOrRegisterEmployeeByPhone } from '../services/authService';
import { Phone, User, Key, Lock, ShieldAlert, ArrowRight, Loader2, Sparkles, Building2 } from 'lucide-react';

export default function LoginModal({ onSuccess }) {
  const [activeTab, setActiveTab] = useState('employee'); // 'employee' | 'admin'
  
  // Employee state
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');

  // Admin state
  const [username, setUsername] = useState('username321');
  const [password, setPassword] = useState('765483cr654');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleEmployeeSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { user, profile } = await loginOrRegisterEmployeeByPhone(phone, fullName);
      if (onSuccess) onSuccess(user, profile);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { user, profile } = await loginAdminUsername(username, password);
      if (onSuccess) onSuccess(user, profile);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto my-8 p-6 sm:p-8 bg-white border border-slate-200 rounded-3xl shadow-xl">
      
      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm">
          <Building2 className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">
          Pointeuse Pyjama DZ
        </h2>
        <p className="text-xs text-slate-500 mt-1 font-medium">
          Connectez-vous pour pointer ou gérer votre équipe
        </p>
      </div>

      {/* Tabs */}
      <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 mb-6">
        <button
          type="button"
          onClick={() => { setActiveTab('employee'); setError(null); }}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'employee'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          📱 Espace Employé
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('admin'); setError(null); }}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'admin'
              ? 'bg-white text-indigo-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          👑 Direction / Admin
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-800">
          <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <span className="font-bold block mb-0.5">Attention</span>
            {error}
          </div>
        </div>
      )}

      {/* EMPLOYEE FORM (Phone + Name) */}
      {activeTab === 'employee' ? (
        <form onSubmit={handleEmployeeSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
              Numéro de Téléphone
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0550 12 34 56"
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white font-mono font-medium transition-all"
              />
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              💡 Sert d'identifiant unique pour votre smartphone.
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
              Nom et Prénom
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ex : Yasser Latreche"
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white font-medium transition-all"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-extrabold rounded-xl text-sm transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Connexion en cours...</span>
                </>
              ) : (
                <>
                  <span>Entrer / S'inscrire</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
            <p className="text-[11px] text-slate-600 leading-relaxed">
              <strong className="text-slate-800">Note sécurité :</strong> Lors de votre première inscription, votre compte sera en attente de validation par l'administrateur.
            </p>
          </div>
        </form>
      ) : (
        /* ADMIN FORM (username321 / 765483cr654) */
        <form onSubmit={handleAdminSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
              Nom d'utilisateur Admin
            </label>
            <div className="relative">
              <Key className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="username321"
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 font-mono font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
              Mot de passe
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 font-mono font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-extrabold rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Vérification...</span>
                </>
              ) : (
                <>
                  <span>Connexion Direction</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl text-center">
            <p className="text-[11px] text-indigo-900">
              ⚡ Accès réservé à la direction et aux auditeurs de paie Pyjama DZ.
            </p>
          </div>
        </form>
      )}

    </div>
  );
}
