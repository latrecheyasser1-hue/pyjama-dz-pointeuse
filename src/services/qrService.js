// ============================================================================
// Pyjama DZ Pointeuse: Dynamic QR Code Service (30-Second TOTP)
// ============================================================================

/**
 * Generates an SHA-256 hash string using Web Crypto API
 */
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Returns the current Epoch for 30-second intervals (changes automatically every 30 seconds)
 */
export function getCurrentEpoch30s() {
  return Math.floor(Date.now() / 30000);
}

/**
 * Backward compatible alias for existing components
 */
export function getCurrentEpochHour() {
  return getCurrentEpoch30s();
}

/**
 * Generates the dynamic QR code string for a given workplace
 * Format: PYJAMA-QR|{workplaceId}|{epoch30s}|{hashSignature}
 */
export async function generateDynamicQR(workplaceId, secret, epoch30s = getCurrentEpoch30s()) {
  if (!workplaceId || !secret) {
    throw new Error('Workplace ID and Secret sont requis pour générer le QR code.');
  }
  
  const payloadToHash = `${workplaceId}:${secret}:${epoch30s}`;
  const signature = await sha256(payloadToHash);
  
  // Return formatted token string
  return `PYJAMA-QR|${workplaceId}|${epoch30s}|${signature.slice(0, 16)}`;
}

/**
 * Validates a scanned QR token string against the workplace secret.
 * Includes a grace buffer (checks current epoch, previous 30s window, and next 30s window)
 * to prevent false rejections during network lag or slight clock differences.
 */
export async function validateQRToken(workplaceId, secret, scannedTokenString) {
  if (!scannedTokenString || !scannedTokenString.startsWith('PYJAMA-QR|')) {
    return {
      valid: false,
      error: 'Format du QR Code invalide. Veuillez scanner un QR Code officiel Pyjama DZ.'
    };
  }

  const parts = scannedTokenString.split('|');
  if (parts.length !== 4) {
    return { valid: false, error: 'QR Code corrompu ou incomplet.' };
  }

  const [prefix, tokenWorkplaceId, tokenEpochStr, tokenSig] = parts;
  const tokenEpoch = parseInt(tokenEpochStr, 10);

  if (tokenWorkplaceId !== workplaceId) {
    return {
      valid: false,
      error: 'Ce QR Code appartient à un autre lieu de travail !'
    };
  }

  const currentEpoch = getCurrentEpoch30s();
  
  // Check if token epoch is within current 30s, previous 30s, or next 30s (grace buffer)
  if (tokenEpoch !== currentEpoch && tokenEpoch !== currentEpoch - 1 && tokenEpoch !== currentEpoch + 1) {
    return {
      valid: false,
      error: 'QR Code expiré ! Le code mural change toutes les 30 secondes. Veuillez scanner le nouveau code.'
    };
  }

  // Verify signature
  const expectedToken = await generateDynamicQR(workplaceId, secret, tokenEpoch);
  const expectedSig = expectedToken.split('|')[3];

  if (tokenSig !== expectedSig) {
    return {
      valid: false,
      error: 'Signature de sécurité invalide (Tentative de fraude détectée).'
    };
  }

  return {
    valid: true,
    workplaceId,
    epochHour: tokenEpoch,
    signature: tokenSig
  };
}
