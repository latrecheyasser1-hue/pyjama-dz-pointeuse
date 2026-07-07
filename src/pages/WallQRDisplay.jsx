import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { generateDynamicQR, getCurrentEpoch30s } from '../services/qrService';
import { QRCodeSVG } from 'qrcode.react';

/**
 * WallQRDisplay:
 * Exigence utilisateur : "safha lii tael code qr ani baaghiiha ykoon fiihaa ghiiiiiiiiir code qr haaaaaada maakan ok maafiiha hta element wahdookher"
 * 
 * Cette page affiche UNIQUEMENT et STRICTEMENT le Code QR en plein centre sur fond blanc pure (#ffffff).
 * Absolument aucun autre élément, texte, bouton ou en-tête n'est affiché !
 * Le code change automatiquement toutes les 30 secondes.
 */
export default function WallQRDisplay() {
  const [workplace, setWorkplace] = useState(null);
  const [qrToken, setQrToken] = useState('');
  const [currentEpoch, setCurrentEpoch] = useState(getCurrentEpoch30s());

  // 1. Fetch Workplace Details
  useEffect(() => {
    async function fetchWorkplace() {
      try {
        const { data, error } = await supabase
          .from('workplaces')
          .select('id, qr_secret')
          .eq('name', 'Siège Principal Alger - Pyjama DZ')
          .single();

        if (data) {
          setWorkplace(data);
        } else {
          // Fallback first workplace
          const { data: firstWp } = await supabase.from('workplaces').select('id, qr_secret').limit(1).single();
          if (firstWp) setWorkplace(firstWp);
        }
      } catch (e) {
        console.error('Workplace fetch error:', e);
      }
    }
    fetchWorkplace();
  }, []);

  // 2. Generate Dynamic QR Token (Every 30 seconds)
  useEffect(() => {
    if (!workplace) return;

    async function updateQR() {
      try {
        const epoch = getCurrentEpoch30s();
        const token = await generateDynamicQR(workplace.id, workplace.qr_secret, epoch);
        setQrToken(token);
        setCurrentEpoch(epoch);
      } catch (e) {
        console.error('QR generation error:', e);
      }
    }

    updateQR();
  }, [workplace, currentEpoch]);

  // 3. Interval check every 1 second to see if 30s window rolled over
  useEffect(() => {
    const timer = setInterval(() => {
      const newEpoch = getCurrentEpoch30s();
      if (newEpoch !== currentEpoch) {
        setCurrentEpoch(newEpoch);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [currentEpoch]);

  // Calculate dynamic responsive size for pure QR display
  const qrSize = typeof window !== 'undefined' ? Math.min(window.innerWidth * 0.85, window.innerHeight * 0.85, 750) : 500;

  return (
    <div className="min-h-screen w-full bg-white flex items-center justify-center m-0 p-0 overflow-hidden">
      {qrToken ? (
        <QRCodeSVG
          value={qrToken}
          size={qrSize}
          level="H"
          includeMargin={false}
          className="block m-auto transition-all duration-300"
        />
      ) : null}
    </div>
  );
}
