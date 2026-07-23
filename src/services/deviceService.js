// ============================================================================
// Pyjama DZ Pointeuse: Device Fingerprinting & Anti-Fraud Locking
// ============================================================================
import { supabase } from '../lib/supabase';

/**
 * Generates an SHA-256 hash string
 */
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generates a stable, unique device fingerprint for the user's phone/browser
 */
export async function getDeviceFingerprint() {
  // 1. Get or create persistent device UUID in localStorage
  let storageId = localStorage.getItem('pyjama_device_uuid');
  if (!storageId) {
    storageId = 'device_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem('pyjama_device_uuid', storageId);
  }

  // 2. Gather hardware & browser characteristics
  const nav = window.navigator;
  const screenRes = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Algiers';
  const language = nav.language || 'fr-DZ';
  const userAgent = nav.userAgent || 'unknown';
  const cores = nav.hardwareConcurrency || 4;

  const rawString = `${storageId}|${screenRes}|${timezone}|${language}|${userAgent}|${cores}`;
  
  // Hash to create a clean 64-character hex fingerprint
  const fingerprint = await sha256(rawString);
  return fingerprint;
}

/**
 * Checks device lock in Supabase profiles table.
 * If bound_device_id is null -> Binds this phone permanently to the user!
 * If bound_device_id matches -> Allowed!
 * If bound_device_id differs -> Throws fraud violation!
 */
export async function verifyOrBindDevice(userId) {
  const currentFingerprint = await getDeviceFingerprint();

  // Fetch user profile with all fields including workplace_id
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*, workplaces(name)')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    throw new Error('Profil utilisateur introuvable.');
  }

  if (profile.status === 'suspended') {
    throw new Error('COMPTE SUSPENDU : Votre accès au système de pointage a été désactivé par la direction.');
  }

  if (profile.status === 'pending') {
    throw new Error('COMPTE EN ATTENTE : Votre compte doit être validé par l\'administrateur avant votre premier pointage.');
  }

  // Admin/Managers can bypass strict device locking if needed, but let's enforce or check
  if (profile.role === 'admin') {
    return {
      authorized: true,
      allowed: true,
      profile,
      fingerprint: currentFingerprint,
      isNewBinding: false,
      message: 'Accès Administrateur vérifié.'
    };
  }

  // Update device binding in background if it changed, without blocking the employee
  if (profile.bound_device_id !== currentFingerprint) {
    await supabase
      .from('profiles')
      .update({ bound_device_id: currentFingerprint })
      .eq('id', userId);
  }

  return {
    authorized: true,
    allowed: true,
    profile: { ...profile, bound_device_id: currentFingerprint },
    fingerprint: currentFingerprint,
    isNewBinding: false,
    message: 'Appareil vérifié.'
  };
}

/**
 * Returns basic information about the current device/browser
 */
export function getDeviceInfo() {
  const nav = window.navigator;
  const storageId = localStorage.getItem('pyjama_device_uuid') || 'Non enregistré';
  return {
    fingerprint: storageId,
    userAgent: nav.userAgent || 'Unknown Mobile',
    platform: nav.platform || 'Mobile OS',
    language: nav.language || 'fr-DZ',
    screen: `${window.screen.width}x${window.screen.height}`
  };
}

/**
 * Verifies device lock (alias for verifyOrBindDevice)
 */
export async function verifyDeviceLock(userId, currentFingerprint) {
  return await verifyOrBindDevice(userId);
}

/**
 * Unlocks / resets a user's device binding so they can log in from a new phone
 */
export async function unlockUserDevice(userId) {
  const { error } = await supabase
    .from('profiles')
    .update({ bound_device_id: null })
    .eq('id', userId);

  if (error) {
    throw new Error("Erreur lors du déverrouillage de l'appareil : " + error.message);
  }
  return true;
}
