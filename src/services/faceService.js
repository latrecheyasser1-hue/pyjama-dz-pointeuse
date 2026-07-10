import * as faceapi from '@vladmandic/face-api';

let modelsLoaded = false;

/**
 * Charge les modèles IA depuis le dossier public/models
 */
export async function loadFaceModels() {
  if (modelsLoaded) return true;
  
  try {
    const MODEL_URL = '/models';
    
    // On charge les modèles légers pour des performances optimales sur navigateur
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    
    modelsLoaded = true;
    return true;
  } catch (error) {
    console.error('Erreur lors du chargement des modèles Face-API:', error);
    return false;
  }
}

/**
 * Détecte un visage sur un élément <video> et retourne son empreinte (128 chiffres)
 */
export async function getFaceDescriptor(videoElement) {
  if (!modelsLoaded) await loadFaceModels();
  
  try {
    // On utilise TinyFaceDetectorOptions pour être rapide
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
    
    const detection = await faceapi.detectSingleFace(videoElement, options)
      .withFaceLandmarks(true) // true = utiliser les landmarks tiny
      .withFaceDescriptor();
      
    if (!detection) return null;
    
    // Le descripteur est un Float32Array, on le convertit en Array normal pour JSON
    return Array.from(detection.descriptor);
  } catch (error) {
    console.error('Erreur lors de la détection faciale:', error);
    return null;
  }
}

/**
 * Trouve le visage qui correspond le mieux parmi la liste des profils
 * @param {Array<number>} scannedDescriptor Le descripteur extrait de la vidéo
 * @param {Array<Object>} profiles Liste des profils [{id: '...', face_descriptor: [...] }]
 * @returns {Object|null} Le profil trouvé, ou null
 */
export function findMatchingProfile(scannedDescriptor, profiles) {
  if (!scannedDescriptor || !profiles || profiles.length === 0) return null;
  
  const validProfiles = profiles.filter(p => p.face_descriptor && Array.isArray(p.face_descriptor));
  if (validProfiles.length === 0) return null;
  
  // Convertir les profils en LabeledFaceDescriptors pour face-api
  const labeledDescriptors = validProfiles.map(p => {
    // On doit reconvertir l'array normal en Float32Array
    const float32Desc = new Float32Array(p.face_descriptor);
    return new faceapi.LabeledFaceDescriptors(p.id, [float32Desc]);
  });
  
  // Seuil de tolérance (distance max). Plus c'est bas, plus c'est strict.
  // 0.6 est le standard par défaut. 0.5 est plus sécurisé.
  const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.5);
  
  const match = faceMatcher.findBestMatch(new Float32Array(scannedDescriptor));
  
  if (match.label !== 'unknown') {
    // label contient l'ID de l'employé
    return validProfiles.find(p => p.id === match.label) || null;
  }
  
  return null;
}
