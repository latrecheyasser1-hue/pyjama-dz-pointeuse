import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { createOfflineEmployee } from '../services/authService';
import { ScanFace, UserPlus, Loader2 } from 'lucide-react';

export default function OfflineWorkerEnrollment({ workplaceId, onEmployeeAdded }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !phone) {
      setError('Veuillez remplir tous les champs.');
      return;
    }
    
    setLoading(true);
    setError(null);
    setMessage(null);
    
    try {
      // 1. Inscrire l'employé sans smartphone
      const { profile } = await createOfflineEmployee(name, phone);
      
      // 2. Envoyer un ordre Realtime à la Tablette Murale
      // On utilise le channel public associé au workplace
      const channelName = `workplace_${workplaceId || 'default'}`;
      const channel = supabase.channel(channelName);
      
      await channel.send({
        type: 'broadcast',
        event: 'start_face_enrollment',
        payload: {
          employee_id: profile.id,
          employee_name: profile.full_name
        }
      });
      
      setMessage(`✅ Succès! Veuillez placer ${profile.full_name} devant la tablette murale pour scanner son visage.`);
      setName('');
      setPhone('');
      
      if (onEmployeeAdded) onEmployeeAdded();
      
      // Nettoyer le channel
      setTimeout(() => {
        supabase.removeChannel(channel);
      }, 5000);
      
    } catch (err) {
      setError(err.message || "Une erreur s'est produite");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
          <ScanFace className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-bold text-slate-800">Ajouter un employé Hors-Ligne (Visage)</h4>
          <p className="text-xs text-slate-500">
            Pour les employés sans smartphone. Créez le compte ici, puis scannez leur visage sur la pointeuse murale.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
        <div className="w-full sm:w-auto flex-1">
          <label className="block text-xs font-bold text-slate-700 mb-1">Nom et Prénom</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Ahmed Benali"
            className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            required
          />
        </div>
        
        <div className="w-full sm:w-auto flex-1">
          <label className="block text-xs font-bold text-slate-700 mb-1">Numéro de Téléphone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ex: 0550112233"
            className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full sm:w-auto px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70 text-white rounded-xl font-bold text-sm shadow-sm flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <UserPlus className="w-4 h-4" />
          )}
          Créer & Scanner Visage
        </button>
      </form>

      {error && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-xl text-sm font-medium border border-red-100 flex items-start gap-2">
          <span>❌</span> {error}
        </div>
      )}
      
      {message && (
        <div className="mt-4 p-3 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-medium border border-emerald-100 flex items-start gap-2">
          {message}
        </div>
      )}
    </div>
  );
}
