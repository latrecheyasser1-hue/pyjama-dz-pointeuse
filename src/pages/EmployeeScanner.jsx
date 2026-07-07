import React, { useState, useEffect } from 'react';
import { getEmployeeTodayStatus, processAttendanceScan } from '../services/attendanceService';
import { generateDynamicQR, getCurrentEpochHour } from '../services/qrService';
import { getDeviceFingerprint } from '../services/deviceService';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Smartphone, CheckCircle2, AlertTriangle, Clock, ShieldCheck, Camera, Sparkles, RefreshCw, Volume2, History } from 'lucide-react';

export default function EmployeeScanner({ user, profile }) {
  const [status, setStatus] = useState({ logs: [], currentStatus: 'out', totalHoursToday: 0 });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);
  const [deviceFp, setDeviceFp] = useState('');
  const [demoLoading, setDemoLoading] = useState(false);

  // 1. Fetch Today Status & Device Fingerprint
  const refreshStatus = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await getEmployeeTodayStatus(user.id);
      setStatus(res);
      const fp = await getDeviceFingerprint();
      setDeviceFp(fp);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshStatus();
  }, [user]);

  // 2. Audio & Haptic Feedback Helper
  const playFeedback = (success = true) => {
    // Haptic vibration
    if (navigator.vibrate) {
      navigator.vibrate(success ? [200, 100, 200] : [400, 200, 400]);
    }

    // Web Audio API Beep
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (success) {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
      } else {
        osc.frequency.setValueAtTime(220, ctx.currentTime); // A3
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
      }
    } catch (e) {
      console.log('Audio feedback error:', e);
    }
  };

  // 3. Initialize Camera Scanner
  useEffect(() => {
    if (!scanning) return;

    const scanner = new Html5QrcodeScanner(
      'reader',
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        showTorchButtonIfSupported: true,
      },
      false
    );

    scanner.render(
      async (decodedText) => {
        // Stop scanning immediately on detection
        scanner.clear();
        setScanning(false);
        await handleProcessToken(decodedText);
      },
      (err) => {
        // Ignore frame read errors
      }
    );

    return () => {
      scanner.clear().catch(e => console.log('Scanner clear err:', e));
    };
  }, [scanning]);

  // 4. Process Token (from Camera OR Demo Button)
  const handleProcessToken = async (tokenString) => {
    setError(null);
    setScanResult(null);
    setDemoLoading(true);

    try {
      const result = await processAttendanceScan(user.id, tokenString);
      playFeedback(true);
      setScanResult(result);
      await refreshStatus();
    } catch (err) {
      playFeedback(false);
      setError(err.message || 'Erreur lors du pointage.');
    } finally {
      setDemoLoading(false);
    }
  };

  // 5. Simulate Scan for Desktop/PC Testing without camera
  const handleSimulatedScan = async () => {
    setError(null);
    setScanResult(null);
    setDemoLoading(true);
    try {
      // Fetch active workplace secret to generate valid token
      const epoch = getCurrentEpochHour();
      const token = await generateDynamicQR(profile.workplace_id, 'dz_secret_key_2026_alger_pointeuse_totp', epoch);
      await handleProcessToken(token);
    } catch (err) {
      playFeedback(false);
      setError(err.message || 'Erreur lors du test simulé.');
      setDemoLoading(false);
    }
  };

  if (!user || !profile) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center text-white">
        <AlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
        <h3 className="text-xl font-bold">Veuillez vous connecter</h3>
        <p className="text-sm text-slate-400 mt-1">
          Vous devez être authentifié pour accéder au scanner de pointage personnel.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6 animate-fade-in">
      
      {/* Employee Status Header Card */}
      <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-indigo-600 flex items-center justify-center text-white font-black text-xl shadow-lg">
              {profile.full_name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white">
                {profile.full_name}
              </h2>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Appareil : {deviceFp ? deviceFp.slice(0, 12) + '...' : 'Vérification...'}</span>
              </p>
            </div>
          </div>

          {/* Current Live Badge */}
          <div className="flex items-center gap-3 self-stretch sm:self-auto justify-end">
            <div className={`px-4 py-2.5 rounded-2xl border font-bold text-sm flex items-center gap-2 shadow-sm ${
              status.currentStatus === 'in'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-emerald-500/10'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}>
              <span className={`w-2.5 h-2.5 rounded-full ${status.currentStatus === 'in' ? 'bg-emerald-400 animate-ping' : 'bg-red-400'}`}></span>
              <span>{status.currentStatus === 'in' ? '🟢 EN POSTE ACTUELLEMENT' : '🔴 HORS POSTE'}</span>
            </div>
          </div>
        </div>

        {/* Quick Today Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-6 pt-6 border-t border-slate-800">
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/60">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Heures Aujourd'hui
            </span>
            <span className="text-lg font-bold text-white mt-0.5 block">
              {status.totalHoursToday} h
            </span>
          </div>

          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/60">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Sessions / Pointages
            </span>
            <span className="text-lg font-bold text-white mt-0.5 block">
              {status.logs.length}
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-slate-800/50 rounded-xl p-3 border border-slate-700/60 flex items-center justify-between sm:block">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Statut Sécurité
            </span>
            <span className="text-xs font-bold text-emerald-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Verrouillé & Conform
            </span>
          </div>
        </div>
      </div>

      {/* Main Scanner Section */}
      <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 text-center shadow-xl space-y-6">
        
        {!scanning ? (
          <div className="py-6 space-y-6">
            <div className="w-20 h-20 bg-gradient-to-tr from-emerald-500/20 to-indigo-500/20 rounded-3xl flex items-center justify-center mx-auto border border-emerald-500/30 shadow-lg group">
              <Camera className="w-10 h-10 text-emerald-400 group-hover:scale-110 transition-transform" />
            </div>

            <div className="max-w-md mx-auto space-y-2">
              <h3 className="text-xl font-bold text-white">
                Prêt pour le Pointage
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Appuyez sur le bouton ci-dessous pour activer l'appareil photo et scanner le QR Code mural de votre entreprise.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={() => { setScanning(true); setError(null); setScanResult(null); }}
                disabled={demoLoading}
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-emerald-500 to-indigo-600 hover:from-emerald-600 hover:to-indigo-700 text-white font-extrabold text-sm rounded-2xl shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all flex items-center justify-center gap-2"
              >
                <Camera className="w-5 h-5" />
                <span>Ouvrir le Scanner QR</span>
              </button>

              {/* Simulated Test Button for PC / Desktop / No Camera */}
              <button
                onClick={handleSimulatedScan}
                disabled={demoLoading}
                className="w-full sm:w-auto px-6 py-4 bg-slate-800 hover:bg-slate-700 text-indigo-300 font-bold text-xs rounded-2xl border border-indigo-500/30 transition-all flex items-center justify-center gap-2 shadow-sm"
                title="Simule le scan du code mural actif pour tester instantanément sur PC"
              >
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span>Simuler Pointage (Démo PC)</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                Caméra Active - Pointez vers le mur
              </span>
              <button
                onClick={() => setScanning(false)}
                className="px-3 py-1 bg-red-500/20 text-red-300 hover:bg-red-500/30 rounded-lg text-xs font-bold transition-all border border-red-500/30"
              >
                Fermer
              </button>
            </div>

            {/* Html5Qrcode Reader Box */}
            <div className="max-w-sm mx-auto overflow-hidden rounded-2xl border-2 border-emerald-500/50 shadow-2xl bg-black">
              <div id="reader" className="w-full"></div>
            </div>

            <p className="text-xs text-slate-400 animate-pulse">
              En attente de détection du QR Code Pyjama DZ...
            </p>
          </div>
        )}

        {/* Loading Spinner */}
        {demoLoading && (
          <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700 flex items-center justify-center gap-3 text-slate-300 text-sm font-semibold animate-pulse">
            <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
            <span>Vérification cryptographique en cours...</span>
          </div>
        )}

        {/* Scan Success Banner */}
        {scanResult && (
          <div className="p-6 bg-gradient-to-r from-emerald-900/60 to-teal-900/60 border-2 border-emerald-500/50 rounded-2xl text-left space-y-3 animate-bounce-short shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 bg-emerald-500 text-slate-950 font-black text-xs rounded-full uppercase tracking-wider">
                {scanResult.actionLabel}
              </span>
              <span className="text-xs font-mono text-emerald-300">
                {new Date(scanResult.scanTime).toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>

            <p className="text-sm font-bold text-white">
              {scanResult.message}
            </p>

            {scanResult.isNewBinding && (
              <p className="text-xs text-emerald-200 bg-emerald-500/20 p-2.5 rounded-xl border border-emerald-500/30">
                🔒 Votre smartphone a été définitivement lié à votre compte. Seul ce téléphone sera autorisé pour vos futurs pointages.
              </p>
            )}
          </div>
        )}

        {/* Scan Error Banner */}
        {error && (
          <div className="p-6 bg-red-900/60 border-2 border-red-500/60 rounded-2xl text-left space-y-2 animate-shake shadow-2xl">
            <div className="flex items-center gap-2 text-red-300 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
              <span>Échec de la validation</span>
            </div>
            <p className="text-xs text-red-200 leading-relaxed font-medium">
              {error}
            </p>
          </div>
        )}

      </div>

      {/* Today Attendance History */}
      <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-400" />
            Historique de la Journée
          </h3>
          <button
            onClick={refreshStatus}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all"
            title="Rafraîchir l'historique"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {status.logs.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-6">
            Aucun pointage enregistré pour aujourd'hui. Scannez le code mural pour démarrer !
          </p>
        ) : (
          <div className="space-y-2">
            {status.logs.map((log, index) => {
              const isIn = log.action_type === 'check_in';
              return (
                <div
                  key={log.id || index}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-800/50 border border-slate-700/60 hover:border-slate-600 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${isIn ? 'bg-emerald-400' : 'bg-red-400'}`}></div>
                    <div>
                      <span className="text-xs font-bold text-white block">
                        {isIn ? 'Entrée (Check-In)' : 'Sortie (Check-Out)'}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {log.workplaces?.name || 'Siège Pyjama DZ'}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-mono font-bold text-emerald-400 block">
                      {new Date(log.scan_time).toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">
                      Horodatage Serveur
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
