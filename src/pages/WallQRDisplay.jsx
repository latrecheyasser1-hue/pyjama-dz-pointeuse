import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { generateDynamicQR, getCurrentEpoch30s } from '../services/qrService';
import { QRCodeSVG } from 'qrcode.react';
import { getFaceDescriptor, loadFaceModels, findMatchingProfile } from '../services/faceService';
import { ScanFace, X } from 'lucide-react';

export default function WallQRDisplay() {
  const [workplace, setWorkplace] = useState(null);
  const [qrToken, setQrToken] = useState('');
  const [currentEpoch, setCurrentEpoch] = useState(getCurrentEpoch30s());
  
  // Face Recognition State
  const [cameraActive, setCameraActive] = useState(false);
  const [enrollmentMode, setEnrollmentMode] = useState(false);
  const [targetEmployee, setTargetEmployee] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [modelsReady, setModelsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);

  // 1. Fetch Workplace
  const [errorMsg, setErrorMsg] = useState('');
  useEffect(() => {
    async function fetchWorkplace() {
      const { data, error } = await supabase.rpc('get_qr_workplace');
      if (data && data.length > 0) {
        setWorkplace(data[0]);
      } else {
        setErrorMsg("⚠️ Erreur de configuration. Veuillez exécuter le code SQL fourni par l'assistant.");
      }
    }
    fetchWorkplace();
    
    // Load models in background
    loadFaceModels().then(success => setModelsReady(success));
  }, []);

  // 2. Realtime Listener for Enrollment (from Admin)
  useEffect(() => {
    if (!workplace) return;
    
    const channel = supabase.channel(`workplace_${workplace.id}`)
      .on('broadcast', { event: 'start_face_enrollment' }, (payload) => {
        setEnrollmentMode(true);
        setTargetEmployee(payload.payload);
        setCameraActive(true);
        setStatusMessage(`Veuillez placer votre visage, ${payload.payload.employee_name}...`);
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [workplace]);

  // 3. Dynamic QR Generator
  useEffect(() => {
    if (!workplace) return;
    async function updateQR() {
      const epoch = getCurrentEpoch30s();
      const token = await generateDynamicQR(workplace.id, workplace.qr_secret, epoch);
      setQrToken(token);
      setCurrentEpoch(epoch);
    }
    updateQR();
  }, [workplace, currentEpoch]);

  useEffect(() => {
    const timer = setInterval(() => {
      const newEpoch = getCurrentEpoch30s();
      if (newEpoch !== currentEpoch) setCurrentEpoch(newEpoch);
    }, 1000);
    return () => clearInterval(timer);
  }, [currentEpoch]);

  // 4. Camera Management
  useEffect(() => {
    if (cameraActive) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [cameraActive]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      
      // Start continuous scanning (plus rapide: 500ms au lieu de 1500ms)
      scanIntervalRef.current = setInterval(processVideoFrame, 500);
    } catch (e) {
      console.error(e);
      setStatusMessage('Erreur Caméra. Vérifiez les permissions.');
    }
  };

  const stopCamera = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
  };

  const processVideoFrame = async () => {
    if (!videoRef.current || isProcessing) return;
    setIsProcessing(true);
    
    try {
      const descriptor = await getFaceDescriptor(videoRef.current);
      if (!descriptor) {
        setIsProcessing(false);
        return; // No face detected yet
      }
      
      // Face detected!
      if (enrollmentMode && targetEmployee) {
        await handleEnrollment(descriptor);
      } else {
        await handleCheckIn(descriptor);
      }
      
    } catch (e) {
      console.error(e);
      setIsProcessing(false);
    }
  };

  const handleEnrollment = async (descriptor) => {
    stopCamera();
    setStatusMessage('✅ Enregistrement en cours...');
    
    // Utilisation d'une fonction RPC pour bypasser RLS (car la tablette n'est pas connectée)
    const { error } = await supabase.rpc('update_face_descriptor', {
      p_employee_id: targetEmployee.employee_id,
      p_descriptor: descriptor
    });
      
    if (!error) {
      setStatusMessage(`✅ Visage enregistré pour ${targetEmployee.employee_name} !`);
      setTimeout(() => closeCamera(), 4000);
    } else {
      setStatusMessage('❌ Erreur. Réessayez.');
      setIsProcessing(false);
      startCamera(); // Restart to try again
    }
  };

  const handleCheckIn = async (descriptor) => {
    // 1. Fetch all profiles with face descriptors using RPC to bypass RLS
    const { data: profiles, error: pError } = await supabase.rpc('get_facial_profiles');
      
    if (pError || !profiles || profiles.length === 0) {
      setStatusMessage('❌ Aucun visage enregistré dans le système.');
      setTimeout(() => closeCamera(), 3000);
      return;
    }

    // 2. Find match
    const match = findMatchingProfile(descriptor, profiles);
    if (!match) {
      setStatusMessage('❌ Visage inconnu. Réessayez.');
      setIsProcessing(false);
      return;
    }
    
    // 3. Matched! Stop camera, record attendance
    stopCamera();
    setStatusMessage(`✅ Bonjour ${match.full_name} ! Pointage en cours...`);
    
    // Get current ALGIERS date/time
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Algiers', year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const parts = formatter.formatToParts(now);
    const y = parts.find(p => p.type === 'year').value;
    const m = parts.find(p => p.type === 'month').value;
    const d = parts.find(p => p.type === 'day').value;
    const dateStr = `${y}-${m}-${d}`;
    
    // Use RPC to automatically determine check_in/check_out and insert bypassing RLS
    const { data: actionType, error } = await supabase.rpc('process_facial_attendance', {
      p_employee_id: match.id,
      p_workplace_id: workplace.id,
      p_date: dateStr,
      p_notes: 'Pointage par Reconnaissance Faciale'
    });
    
    if (error) {
       setStatusMessage(`❌ Erreur: ${error.message}`);
    } else {
       const actStr = actionType === 'check_in' ? 'Entrée' : 'Sortie';
       setStatusMessage(`✅ ${actStr} enregistrée pour ${match.full_name} !`);
    }
    
    setTimeout(() => closeCamera(), 4000);
  };

  const closeCamera = () => {
    setCameraActive(false);
    setEnrollmentMode(false);
    setTargetEmployee(null);
    setStatusMessage('');
    setIsProcessing(false);
  };

  const qrSize = typeof window !== 'undefined' ? Math.min(window.innerWidth * 0.7, window.innerHeight * 0.7, 500) : 500;

  return (
    <div className="min-h-screen w-full bg-white flex flex-col items-center justify-center m-0 p-0 overflow-hidden relative">
      
      {/* CAMERA OVERLAY */}
      {cameraActive && (
        <div className="absolute inset-0 z-50 bg-slate-900 flex flex-col items-center justify-center">
          <button onClick={closeCamera} className="absolute top-6 right-6 text-white p-3 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-8 h-8" />
          </button>
          
          <h2 className="text-white text-3xl font-black mb-12 text-center px-4 animate-fade-in">
            {statusMessage || "Placez votre visage au centre"}
          </h2>
          
          <div className="relative w-80 h-80 sm:w-96 sm:h-96 rounded-full overflow-hidden border-8 border-indigo-500 shadow-[0_0_80px_rgba(99,102,241,0.6)]">
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              className="absolute inset-0 w-full h-full object-cover scale-125 transform -scale-x-100"
            />
            {isProcessing && !statusMessage.includes('✅') && (
               <div className="absolute inset-0 border-8 border-t-indigo-300 rounded-full animate-spin"></div>
            )}
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="absolute inset-0 z-40 bg-white flex flex-col items-center justify-center p-6 text-center">
          <p className="text-xl font-bold text-red-600 max-w-lg">{errorMsg}</p>
        </div>
      )}

      {qrToken && !cameraActive && !errorMsg ? (
        <div className="flex flex-col items-center gap-12 animate-fade-in">
          <QRCodeSVG
            value={qrToken}
            size={qrSize}
            level="H"
            includeMargin={false}
            className="block transition-all duration-300"
          />
          
          {modelsReady && (
            <button 
              onClick={() => setCameraActive(true)}
              className="flex items-center gap-4 px-10 py-5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:scale-105 active:scale-95 rounded-full font-black text-2xl transition-all shadow-sm border-2 border-indigo-200"
            >
              <ScanFace className="w-10 h-10" />
              T'pointi bel Wjeh (Reconnaissance Faciale)
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
