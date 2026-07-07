import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { generateDynamicQR, getCurrentEpochHour } from '../services/qrService';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldAlert, RefreshCw, Maximize2, Minimize2, Clock, CheckCircle2, AlertTriangle, Building2 } from 'lucide-react';

export default function WallQRDisplay() {
  const [workplace, setWorkplace] = useState(null);
  const [qrToken, setQrToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeLeft, setTimeLeft] = useState({ minutes: 59, seconds: 59, totalSeconds: 3600 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentHour, setCurrentHour] = useState(getCurrentEpochHour());

  // 1. Fetch Workplace Details
  useEffect(() => {
    async function fetchWorkplace() {
      setLoading(true);
      try {
        const { data, error: err } = await supabase
          .from('workplaces')
          .select('id, name, qr_secret')
          .eq('name', 'Siège Principal Alger - Pyjama DZ')
          .single();

        if (err || !data) {
          // Fallback fetch first workplace if name changed
          const { data: firstWp } = await supabase.from('workplaces').select('*').limit(1).single();
          if (firstWp) {
            setWorkplace(firstWp);
          } else {
            throw new Error('Aucun lieu de travail (Workplace) configuré dans la base de données.');
          }
        } else {
          setWorkplace(data);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    fetchWorkplace();
  }, []);

  // 2. Generate Dynamic QR Token
  useEffect(() => {
    if (!workplace) return;

    async function updateQR() {
      try {
        const epoch = getCurrentEpochHour();
        const token = await generateDynamicQR(workplace.id, workplace.qr_secret, epoch);
        setQrToken(token);
        setCurrentHour(epoch);
      } catch (e) {
        console.error('QR generation error:', e);
      }
    }

    updateQR();
  }, [workplace, currentHour]);

  // 3. Countdown Timer (Every 1 Second)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const minutes = 59 - now.getMinutes();
      const seconds = 59 - now.getSeconds();
      const totalSeconds = minutes * 60 + seconds;

      setTimeLeft({ minutes, seconds, totalSeconds });

      // If hour rolled over, trigger QR regeneration
      const newEpoch = getCurrentEpochHour();
      if (newEpoch !== currentHour) {
        setCurrentHour(newEpoch);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [currentHour]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.log(`Error attempting to enable fullscreen: ${err.message}`);
      });
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center gap-4 text-white">
        <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
        <p className="text-slate-400 text-sm font-medium animate-pulse">
          Chargement de l'écran mural sécurisé...
        </p>
      </div>
    );
  }

  if (error || !workplace) {
    return (
      <div className="max-w-2xl mx-auto mt-12 p-6 bg-red-500/10 border border-red-500/30 rounded-2xl text-center space-y-4 text-white">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
        <h3 className="text-xl font-bold text-red-300">Erreur de chargement du lieu de travail</h3>
        <p className="text-sm text-slate-300">{error || 'Aucune donnée trouvée.'}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 bg-red-600 hover:bg-red-500 font-semibold rounded-xl text-sm transition-all shadow-lg"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const progressPercent = ((3600 - timeLeft.totalSeconds) / 3600) * 100;

  return (
    <div className={`min-h-[85vh] flex flex-col items-center justify-center p-4 sm:p-6 transition-all duration-500 ${isFullscreen ? 'bg-slate-950 p-8' : ''}`}>
      
      {/* Top Banner & Fullscreen Toggle */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-6 bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-black text-white tracking-tight">
              {workplace.name}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                Système Mural Actif & Synchronisé
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={toggleFullscreen}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs sm:text-sm font-semibold transition-all border border-slate-700 shadow-sm"
          title="Afficher en plein écran pour la télévision ou tablette murale"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          <span className="hidden sm:inline">{isFullscreen ? 'Quitter Plein Écran' : 'Mode Écran TV'}</span>
        </button>
      </div>

      {/* Main QR Card */}
      <div className="w-full max-w-4xl bg-slate-900/90 backdrop-blur-2xl border border-slate-800 rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-0">
        
        {/* QR Code Display Column */}
        <div className="lg:col-span-7 p-8 sm:p-12 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-b lg:border-b-0 lg:border-r border-slate-800 relative group">
          
          {/* Subtle glow behind QR */}
          <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 via-indigo-500/5 to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

          <div className="relative p-6 bg-white rounded-3xl shadow-[0_0_50px_rgba(16,185,129,0.25)] group-hover:shadow-[0_0_70px_rgba(16,185,129,0.35)] transition-shadow duration-500">
            {qrToken ? (
              <QRCodeSVG
                value={qrToken}
                size={320}
                level="H"
                includeMargin={false}
                className="w-64 h-64 sm:w-80 sm:h-80 transition-all"
              />
            ) : (
              <div className="w-64 h-64 sm:w-80 sm:h-80 flex items-center justify-center text-slate-400">
                Génération...
              </div>
            )}

            {/* Center Logo Overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-14 h-14 bg-slate-900 border-2 border-emerald-400 rounded-2xl flex items-center justify-center shadow-lg">
                <span className="text-xs font-black text-emerald-400">DZ</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2 text-xs font-mono text-slate-400 bg-slate-800/80 px-4 py-2 rounded-full border border-slate-700/80 shadow-inner">
            <ShieldAlert className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>Jeton : {qrToken ? qrToken.slice(0, 24) + '...' : '---'}</span>
          </div>
        </div>

        {/* Instructions & Live Timer Column */}
        <div className="lg:col-span-5 p-8 flex flex-col justify-between space-y-6 bg-slate-900/50">
          
          <div className="space-y-6">
            <div>
              <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 rounded-full text-xs font-bold uppercase tracking-wider">
                Protocole Anti-Fraude
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white mt-3 leading-tight">
                Scannez pour Pointer
              </h2>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                Ouvrez l'application <strong className="text-slate-200 font-semibold">Pyjama DZ Pointeuse</strong> sur votre smartphone personnel et cadrez ce code.
              </p>
            </div>

            {/* Countdown Box */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 shadow-inner relative overflow-hidden">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  Renouvellement Dynamique
                </span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {String(timeLeft.minutes).padStart(2, '0')}:{String(timeLeft.seconds).padStart(2, '0')}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-700/60 h-2.5 rounded-full overflow-hidden p-0.5">
                <div
                  className="bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500 h-full rounded-full transition-all duration-1000"
                  style={{ width: `${progressPercent}%` }}
                ></div>
              </div>

              <p className="text-[11px] text-slate-400 mt-3 flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-slate-500 animate-spin" style={{ animationDuration: '8s' }} />
                <span>Ce code mural expire automatiquement dans {timeLeft.minutes} minutes.</span>
              </p>
            </div>

            {/* Quick Tips */}
            <div className="space-y-3 pt-2">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                  1
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  <strong className="text-white">Connexion Unique :</strong> Votre compte est lié de manière sécurisée à votre téléphone personnel.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                  2
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  <strong className="text-white">Horodatage Serveur :</strong> L'heure exacte de votre entrée ou sortie est certifiée par le serveur central.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
            <span>© 2026 Pyjama DZ</span>
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Sécurité TOTP Active
            </span>
          </div>

        </div>

      </div>

      {/* Footer Info */}
      <p className="mt-6 text-xs text-slate-500 text-center max-w-lg">
        💡 <strong className="text-slate-400">Astuce Direction :</strong> Affichez cette page sur un écran mural, un iPad ou une TV à l'entrée de l'atelier ou des bureaux.
      </p>

    </div>
  );
}
