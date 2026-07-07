// ============================================================================
// Pyjama DZ Pointeuse: Dynamic QR Code Service (60-Minute Epoch TOTP)
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
 * Returns the current Epoch Hour (changes automatically every 60 minutes)
 */
export function getCurrentEpochHour() {
  return Math.floor(Date.now() / (1000 * 60 * 60));
}

/**
 * Generates the dynamic QR code string for a given workplace
 * Format: PYJAMA-QR|{workplaceId}|{epochHour}|{hashSignature}
 */
export async function generateDynamicQR(workplaceId, secret, epochHour = getCurrentEpochHour()) {
  if (!workplaceId || !secret) {
    throw new Error('Workplace ID and Secret are required to generate QR code.');
  }
  
  const payloadToHash = `${workplaceId}:${secret}:${epochHour}`;
  const signature = await sha256(payloadToHash);
  
  // Return formatted token string
  return `PYJAMA-QR|${workplaceId}|${epochHour}|${signature.slice(0, 16)}`;
}

/**
 * Validates a scanned QR token string against the workplace secret.
 * Includes a 60-second grace buffer (checks both current epoch hour and previous epoch hour)
 * to prevent false rejections right at the turn of the hour.
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

  const [prefix, tokenWorkplaceId, tokenEpochHourStr, tokenSig] = parts;
  const tokenEpochHour = parseInt(tokenEpochHourStr, 10);

  if (tokenWorkplaceId !== workplaceId) {
    return {
      valid: false,
      error: 'Ce QR Code appartient à un autre lieu de travail !'
    };
  }

  const currentEpoch = getCurrentEpochHour();
  
  // Check if token epoch is within current hour or previous hour (grace buffer)
  if (tokenEpochHour !== currentEpoch && tokenEpochHour !== currentEpoch - 1) {
    return {
      valid: false,
      error: 'QR Code expiré ! Le code mural change chaque heure. Veuillez scanner le nouveau code.'
    };
  }

  // Verify signature
  const expectedToken = await generateDynamicQR(workplaceId, secret, tokenEpochHour);
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
    epochHour: tokenEpochHour,
    signature: tokenSig
  };
}
