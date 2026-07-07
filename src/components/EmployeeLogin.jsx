import React, { useState } from 'react';
import { loginOrRegisterEmployeeByPhone } from '../services/authService';
import { Phone, User, ArrowRight, Loader2, ShieldAlert, Smartphone } from 'lucide-react';

export default function EmployeeLogin({ onSuccess }) {
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
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

  return (
    <div className="min-h-screen w-full bg-white flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md p-6 sm:p-8 bg-white border border-slate-200 rounded-3xl shadow-xl">
        
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-sm">
            <Smartphone className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Espace Employé
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Pointeuse Pyjama DZ — Inscription & Connexion
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-800">
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold block mb-0.5">Erreur</span>
              {error}
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
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
                className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white font-mono font-medium transition-all"
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
                className="w-full pl-10 pr-4 py-3.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white font-medium transition-all"
              />
            </div>
          </div>

          <div className="pt-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-extrabold rounded-xl text-sm transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2"
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

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center mt-4">
            <p className="text-[11px] text-slate-600 leading-relaxed">
              <strong className="text-slate-800">Sécurité Pyjama DZ :</strong> Lors de votre première inscription, votre compte sera en attente de validation par l'administrateur.
            </p>
          </div>
        </form>

      </div>
    </div>
  );
}
