import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { validateQRToken } from '../services/qrService';
import { getDeviceFingerprint, getDeviceInfo, verifyDeviceLock } from '../services/deviceService';
import { toggleAttendance, getTodaySummary, processAttendanceScan } from '../services/attendanceService';
import { Camera, CameraOff, CheckCircle2, AlertTriangle, Clock, RefreshCw, Smartphone, ShieldCheck, Play, Lock, LogOut } from 'lucide-react';
import confetti from 'canvas-confetti';

export default function EmployeeScanner({ user, profile, onLogout }) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' | 'user'
  
  // Today's summary state
  const [summary, setSummary] = useState({
    status: 'OUT',
    totalHours: 0,
    checkInTime: null,
    checkOutTime: null
  });

  const [deviceInfo, setDeviceInfo] = useState(null);
  const html5QrCodeRef = useRef(null);

  // 1. Fetch Today Summary & Device Info
  useEffect(() => {
    async function init() {
      if (!user) return;
      try {
        const sum = await getTodaySummary(user.id);
        setSummary(sum);
        const info = getDeviceInfo();
        setDeviceInfo(info);
      } catch (e) {
        console.error('Init error:', e);
      }
    }
    init();
  }, [user]);

  // Force PWA cache refresh helper
  const forceHardRefresh = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (let registration of registrations) {
          registration.unregister();
        }
      });
    }
    if ('caches' in window) {
      caches.keys().then((names) => {
        for (let name of names) {
          caches.delete(name);
        }
      });
    }
    window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now();
  };

  // 2. Audio & Haptic Feedback Helper
  const triggerSuccessFeedback = () => {
    if ('vibrate' in navigator) {
      navigator.vibrate([100, 50, 100]);
    }
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      console.log('Audio feedback error:', e);
    }
  };

  // 3. Start Camera Scanner (< 3 seconds target)
  const startScanner = async (mode = facingMode) => {
    setError(null);
    setScanResult(null);
    setIsScanning(true);

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('reader');
      html5QrCodeRef.current = scanner;

      await scanner.start(
        { facingMode: mode },
        {
          fps: 15,
          qrbox: { width: 260, height: 260 },
          aspectRatio: 1.0
        },
        async (decodedText) => {
          await stopScanner();
          await handleQRScanned(decodedText);
        },
        (errorMessage) => {
          // Ignore frame errors
        }
      );
    } catch (e) {
      setIsScanning(false);
      setError('Impossible d\'accéder à la caméra. Veuillez autoriser la caméra dans votre navigateur.');
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      } catch (e) {
        console.log(e);
      }
    }
    setIsScanning(false);
  };

  const toggleCamera = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (isScanning) {
      await stopScanner();
      // start again with the new mode
      setTimeout(() => {
        startScanner(nextMode);
      }, 300);
    }
  };

  // 4. Process Scanned QR Token
  const handleQRScanned = async (tokenString) => {
    setLoadingAction(true);
    setError(null);
    setScanResult(null);

    try {
      const result = await processAttendanceScan(user.id, tokenString);

      triggerSuccessFeedback();
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });

      setScanResult({
        type: (result.action === 'check_in' || result.action === 'CHECK_IN') ? 'ENTRÉE' : 'SORTIE',
        message: result.message,
        timestamp: new Date(result.scanTime || new Date()).toLocaleTimeString('fr-DZ', { timeZone: 'Africa/Algiers', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      });

      // Refresh summary
      const sum = await getTodaySummary(user.id);
      setSummary(sum);

    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingAction(false);
    }
  };

  // 5. PC Demo Simulator (No Camera Needed)
  const handleSimulateScan = async () => {
    setLoadingAction(true);
    setError(null);
    setScanResult(null);

    try {
      let wpId = profile?.workplace_id;
      let qrSecret = null;

      if (wpId) {
        const { data: wp } = await supabase
          .from('workplaces')
          .select('qr_secret')
          .eq('id', wpId)
          .single();
        if (wp) qrSecret = wp.qr_secret;
      }

      if (!wpId || !qrSecret) {
        const { data: defaultWp } = await supabase
          .from('workplaces')
          .select('id, qr_secret')
          .limit(1)
          .single();
        if (!defaultWp) throw new Error('Aucun lieu de travail configuré dans le système.');
        wpId = defaultWp.id;
        qrSecret = defaultWp.qr_secret;
        if (profile) profile.workplace_id = wpId;
        await supabase.from('profiles').update({ workplace_id: wpId }).eq('id', user.id);
      }

      const { generateDynamicQR, getCurrentEpoch30s } = await import('../services/qrService');
      const validToken = await generateDynamicQR(wpId, qrSecret, getCurrentEpoch30s());

      await handleQRScanned(validToken);
    } catch (e) {
      setError(e.message);
      setLoadingAction(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans">
      
      {/* Standalone Employee Header (No Navbar Links!) */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 py-3 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-sm">
              <span className="font-black text-sm tracking-wider">DZ</span>
            </div>
            <div>
              <h1 className="font-extrabold text-slate-900 text-sm sm:text-base leading-tight">
                Pointeuse <span className="text-emerald-600">Employé</span>
              </h1>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                Pyjama DZ PWA
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={forceHardRefresh}
              title="Forcer la mise à jour et vider le cache PWA"
              className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-all border border-emerald-200 active:scale-95 flex items-center gap-1.5 text-xs font-black shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>v2.6 (Actualiser)</span>
            </button>
            <div className="text-right">
              <span className="text-xs font-bold text-slate-800 block">
                {profile?.full_name || 'Employé'}
              </span>
              <span className="text-[10px] font-semibold text-emerald-600 font-mono">
                {profile?.phone || 'Connecté'}
              </span>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                title="Se déconnecter"
                className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 transition-all border border-slate-200 active:scale-95"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 space-y-6">
        
        {/* IF ACCOUNT IS PENDING VALIDATION BY ADMIN */}
        {profile && profile.status !== 'active' ? (
          <div className="my-8 p-6 sm:p-8 bg-white border border-amber-200 rounded-3xl shadow-xl text-center space-y-6">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-inner">
              <Lock className="w-8 h-8 animate-bounce" />
            </div>
            
            <div className="space-y-2">
              <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold uppercase tracking-wider">
                Statut : En attente de validation
              </span>
              <h2 className="text-2xl font-black text-slate-900 mt-2">
                Compte en Cours de Validation
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed max-w-md mx-auto">
                Bonjour <strong className="text-slate-900">{profile.full_name}</strong> ! Votre inscription avec le numéro <strong className="font-mono text-emerald-600">{profile.phone || profile.email}</strong> a bien été enregistrée.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-left text-xs text-slate-600 space-y-2">
              <p className="font-bold text-slate-800">🔒 Règle de sécurité Pyjama DZ :</p>
              <p>
                Pour éviter toute tentative de fausse inscription, un administrateur doit valider et autoriser votre numéro de téléphone dans le panneau de direction avant que les boutons de scan ne s'affichent.
              </p>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full py-3.5 px-6 bg-slate-900 hover:bg-slate-800 text-white font-extrabold rounded-xl text-sm transition-all shadow-md flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Vérifier mon statut (Actualiser)</span>
            </button>
          </div>
        ) : (
          /* ACTIVE EMPLOYEE SCANNER VIEW */
          <>
            {/* Top Employee Profile & Live Status Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-md flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
              <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white text-xl font-black shadow-md shrink-0">
                  {profile?.full_name?.charAt(0) || 'E'}
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-black text-slate-900">
                    {profile?.full_name || 'Employé Pyjama DZ'}
                  </h2>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5 mt-1 text-xs text-slate-500">
                    <Smartphone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="font-mono font-bold text-slate-700">Tél : {profile?.phone || '---'}</span>
                    <span className="hidden sm:inline">•</span>
                    <span className="text-slate-500">Appareil lié & sécurisé</span>
                  </div>
                </div>
              </div>

              {/* Live Attendance Badge */}
              <div className="flex flex-col items-center sm:items-end w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <div className={`px-4 py-2 rounded-2xl font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm w-full sm:w-auto ${
                  summary.status === 'IN' 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' 
                    : 'bg-slate-100 text-slate-700 border border-slate-300'
                }`}>
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${summary.status === 'IN' ? 'bg-emerald-600 animate-ping' : 'bg-slate-400'}`}></span>
                  <span>{summary.status === 'IN' ? '🟢 EN POSTE' : '🔴 HORS POSTE'}</span>
                </div>
                {summary.checkInTime && (
                  <span className="text-[11px] font-medium text-slate-500 mt-1">
                    Arrivé(e) à {summary.checkInTime}
                  </span>
                )}
              </div>
            </div>

            {/* Main Camera / Action Area */}
            <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-8 shadow-xl flex flex-col items-center justify-center relative overflow-hidden">
              
              {/* Camera Viewport */}
              <div className="w-full max-w-sm aspect-square bg-slate-900 rounded-2xl overflow-hidden border-2 border-slate-200 relative shadow-inner flex items-center justify-center mb-6">
                <div id="reader" className="w-full h-full"></div>

                {!isScanning && !loadingAction && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-900/90 text-white">
                    <Camera className="w-12 h-12 text-emerald-400 mb-3 animate-bounce" />
                    <p className="text-sm font-bold text-slate-200">Caméra Scanner Inactive</p>
                    <p className="text-xs text-slate-400 mt-1">Appuyez ci-dessous pour activer et pointer instantanément</p>
                  </div>
                )}

                {loadingAction && (
                  <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-white z-20">
                    <div className="w-10 h-10 border-4 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin mb-3"></div>
                    <span className="text-xs font-bold text-emerald-400 animate-pulse">Vérification cryptographique...</span>
                  </div>
                )}
              </div>

              {/* Scan Result Feedback Banner */}
              {scanResult && (
                <div className="w-full max-w-sm mb-6 p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-start gap-3 text-emerald-900 shadow-sm animate-fade-in">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-extrabold uppercase tracking-wider block text-emerald-700">
                      Succès • Pointage {scanResult.type}
                    </span>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{scanResult.message}</p>
                    <span className="text-[11px] text-emerald-600 font-mono mt-1 block">Heure serveur : {scanResult.timestamp}</span>
                  </div>
                </div>
              )}

              {/* Error Feedback Banner */}
              {error && (
                <div className="w-full max-w-sm mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex flex-col gap-3 text-red-800 shadow-sm animate-fade-in">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <span className="font-bold block mb-0.5">Échec de vérification</span>
                      {error}
                    </div>
                  </div>
                  <button
                    onClick={forceHardRefresh}
                    className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>🔄 Vider le cache PWA & Réparer (v2.6)</span>
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="w-full max-w-sm space-y-3">
                {!isScanning ? (
                  <button
                    onClick={() => startScanner(facingMode)}
                    disabled={loadingAction}
                    className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl text-sm sm:text-base transition-all shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 active:scale-95"
                  >
                    <Camera className="w-5 h-5 shrink-0" />
                    <span>📷 Ouvrir Caméra Scanner</span>
                  </button>
                ) : (
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={stopScanner}
                      className="flex-1 py-4 px-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-2xl text-xs sm:text-sm transition-all shadow-lg shadow-red-600/25 flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <CameraOff className="w-4 h-4 shrink-0" />
                      <span>Fermer</span>
                    </button>
                    <button
                      onClick={toggleCamera}
                      className="flex-1 py-4 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl text-xs sm:text-sm transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <RefreshCw className="w-4 h-4 shrink-0" />
                      <span>Caméra {facingMode === 'environment' ? 'Devant' : 'Derrière'}</span>
                    </button>
                  </div>
                )}
              </div>

            </div>
          </>
        )}

      </main>

      <footer className="py-4 border-t border-slate-200 bg-slate-50 text-center text-xs text-slate-500 mt-auto">
        <span className="font-bold text-slate-700">Pyjama DZ</span> — Portail Employé PWA (100% Autonome)
      </footer>
    </div>
  );
}
