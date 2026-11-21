import { GeneratedClip, VoiceProfile } from '../types/voice';

const DB_NAME = 'timbre-studio-db';
const DB_VERSION = 1;
const VOICES_STORE = 'voices';
const CLIPS_STORE = 'clips';

export const STARTER_VOICES: VoiceProfile[] = [
  {
    id: 'preset-julian-baritone',
    name: 'Julian Mercer',
    isPreset: true,
    createdAt: 1763600000000,
    baseVoice: 'Charon',
    pitchRegister: 'Warm Baritone',
    timbreTraits: ['Grounded', 'Velvety', 'Close-mic', 'Measured'],
    cadence: 'Unhurried, deliberate pacing with clean clause pauses',
    accentAndArticulation: 'Neutral North American, crisp plosives and warm resonance',
    emotionalBaseline: 'Composed, trustworthy documentary warmth',
    stylePrompt:
      'Speak in a grounded, velvet baritone with close-microphone warmth, unhurried documentary cadence, and crisp yet relaxed articulation.',
    transcript: 'Starter studio voice blueprint',
    acousticStats: {
      durationSec: 0,
      sampleRate: 24000,
      pitchHz: 114,
      spectralCentroidHz: 1420,
      rmsDb: -18.2,
      dynamicRangeDb: 14.5,
      peaks: [
        0.22, 0.35, 0.48, 0.62, 0.78, 0.65, 0.42, 0.58, 0.85, 0.72, 0.45, 0.38,
        0.64, 0.89, 0.94, 0.68, 0.49, 0.56, 0.74, 0.82, 0.61, 0.34, 0.48, 0.67,
        0.79, 0.55, 0.39, 0.61, 0.86, 0.91, 0.71, 0.44, 0.32, 0.52, 0.75, 0.68,
        0.46, 0.39, 0.58, 0.77, 0.84, 0.62, 0.41, 0.53, 0.72, 0.64, 0.38, 0.28,
        0.49, 0.67, 0.78, 0.54, 0.35, 0.47, 0.69, 0.73, 0.51, 0.36, 0.44, 0.62,
        0.58, 0.41, 0.33, 0.49, 0.63, 0.52, 0.37, 0.29, 0.42, 0.35, 0.24, 0.18,
      ],
    },
    dsp: { pitchSemitones: 0, speed: 1, warmthDb: 0, presenceDb: 0 },
  },
  {
    id: 'preset-clara-alto',
    name: 'Clara Vance',
    isPreset: true,
    createdAt: 1763600001000,
    baseVoice: 'Kore',
    pitchRegister: 'Editorial Alto',
    timbreTraits: ['Poised', 'Clear', 'Intimate', 'Natural'],
    cadence: 'Fluid, conversational rhythm with expressive upward inflections',
    accentAndArticulation: 'Crisp transatlantic polish with gentle breath release',
    emotionalBaseline: 'Engaging, intelligent, understated clarity',
    stylePrompt:
      'Deliver speech in a clear, poised editorial alto with subtle breath intimacy, fluid conversational phrasing, and crisp consonant clarity.',
    transcript: 'Starter studio voice blueprint',
    acousticStats: {
      durationSec: 0,
      sampleRate: 24000,
      pitchHz: 188,
      spectralCentroidHz: 2150,
      rmsDb: -17.6,
      dynamicRangeDb: 15.2,
      peaks: [
        0.18, 0.32, 0.55, 0.71, 0.64, 0.44, 0.67, 0.88, 0.76, 0.51, 0.38, 0.59,
        0.81, 0.92, 0.69, 0.47, 0.62, 0.84, 0.73, 0.52, 0.35, 0.49, 0.74, 0.86,
        0.65, 0.42, 0.56, 0.79, 0.88, 0.67, 0.43, 0.31, 0.54, 0.78, 0.71, 0.48,
        0.37, 0.61, 0.82, 0.76, 0.54, 0.39, 0.57, 0.74, 0.66, 0.41, 0.29, 0.51,
        0.72, 0.83, 0.59, 0.38, 0.49, 0.68, 0.74, 0.53, 0.34, 0.46, 0.65, 0.57,
        0.39, 0.28, 0.48, 0.64, 0.51, 0.35, 0.27, 0.39, 0.31, 0.22, 0.16, 0.14,
      ],
    },
    dsp: { pitchSemitones: 0, speed: 1, warmthDb: 0, presenceDb: 0 },
  },
  {
    id: 'preset-sora-zephyr',
    name: 'Mina Takahashi',
    isPreset: true,
    createdAt: 1763600002000,
    baseVoice: 'Zephyr',
    pitchRegister: 'Airy Lyric Voice',
    timbreTraits: ['Airy', 'Bright', 'Expressive', 'Soft-edged'],
    cadence: 'Lively, nimble tempo with warm emotional lift on key phrases',
    accentAndArticulation: 'Light, smooth vowels with gentle studio airiness',
    emotionalBaseline: 'Curious, bright, welcoming storyteller',
    stylePrompt:
      'Speak with a light, airy vocal texture, gentle studio warmth, nimble conversational pacing, and bright expressive lift on emphasized words.',
    transcript: 'Starter studio voice blueprint',
    acousticStats: {
      durationSec: 0,
      sampleRate: 24000,
      pitchHz: 218,
      spectralCentroidHz: 2490,
      rmsDb: -19.1,
      dynamicRangeDb: 16.4,
      peaks: [
        0.15, 0.28, 0.46, 0.68, 0.82, 0.59, 0.37, 0.61, 0.89, 0.79, 0.48, 0.33,
        0.57, 0.84, 0.95, 0.74, 0.46, 0.59, 0.77, 0.85, 0.58, 0.31, 0.45, 0.69,
        0.81, 0.52, 0.36, 0.63, 0.87, 0.90, 0.66, 0.41, 0.29, 0.55, 0.79, 0.64,
        0.42, 0.35, 0.59, 0.81, 0.78, 0.55, 0.37, 0.51, 0.73, 0.61, 0.34, 0.25,
        0.47, 0.69, 0.81, 0.56, 0.32, 0.45, 0.67, 0.72, 0.48, 0.31, 0.43, 0.61,
        0.54, 0.38, 0.29, 0.46, 0.60, 0.48, 0.32, 0.24, 0.37, 0.29, 0.19, 0.14,
      ],
    },
    dsp: { pitchSemitones: 0, speed: 1, warmthDb: 0, presenceDb: 0 },
  },
];

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VOICES_STORE)) {
        db.createObjectStore(VOICES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CLIPS_STORE)) {
        db.createObjectStore(CLIPS_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadVoices(): Promise<VoiceProfile[]> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(VOICES_STORE, 'readonly');
      const store = tx.objectStore(VOICES_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const items = (req.result as VoiceProfile[]) || [];
        if (items.length === 0) {
          resolve(STARTER_VOICES);
        } else {
          items.sort((a, b) => b.createdAt - a.createdAt);
          resolve(items);
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return STARTER_VOICES;
  }
}

export async function saveVoice(voice: VoiceProfile): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(VOICES_STORE, 'readwrite');
    tx.objectStore(VOICES_STORE).put(voice);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function seedStarterVoicesIfNeeded(): Promise<VoiceProfile[]> {
  const db = await openDatabase();
  const existing = await new Promise<VoiceProfile[]>((resolve, reject) => {
    const tx = db.transaction(VOICES_STORE, 'readonly');
    const req = tx.objectStore(VOICES_STORE).getAll();
    req.onsuccess = () => resolve((req.result as VoiceProfile[]) || []);
    req.onerror = () => reject(req.error);
  });

  if (existing.length > 0) {
    return existing.sort((a, b) => b.createdAt - a.createdAt);
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(VOICES_STORE, 'readwrite');
    const store = tx.objectStore(VOICES_STORE);
    for (const v of STARTER_VOICES) {
      store.put(v);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return [...STARTER_VOICES].sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteVoiceById(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(VOICES_STORE, 'readwrite');
    tx.objectStore(VOICES_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadClips(): Promise<GeneratedClip[]> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(CLIPS_STORE, 'readonly');
      const req = tx.objectStore(CLIPS_STORE).getAll();
      req.onsuccess = () => {
        const items = (req.result as GeneratedClip[]) || [];
        items.sort((a, b) => b.createdAt - a.createdAt);
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveClip(clip: GeneratedClip): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CLIPS_STORE, 'readwrite');
    tx.objectStore(CLIPS_STORE).put(clip);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteClipById(id: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CLIPS_STORE, 'readwrite');
    tx.objectStore(CLIPS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
