export type BaseVoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export type TtsModelName = 'gemini-3.8-flash-tts' | 'gemini-3.8-flash-lite-tts' | string;

export type ProviderId =
  | 'gemini'
  | 'browser'
  | 'cloudflare'
  | 'groq'
  | 'huggingface'
  | 'elevenlabs'
  | 'openrouter'
  | 'custom';

export interface ProviderConfig {
  provider: ProviderId;
  apiKey: string;
  accountId?: string;
  customBaseUrl: string;
  analysisModel: string;
  ttsModel: string;
  customVoiceId: string;
}

export interface ProviderPreset {
  id: ProviderId;
  name: string;
  tierNote: string;
  requiresKey: boolean;
  supportsVoiceCloning: boolean;
  supportsTts: boolean;
  supportsDialogue: boolean;
  defaultAnalysisModel: string;
  suggestedAnalysisModels: string[];
  defaultTtsModel: string;
  suggestedTtsModels: string[];
  keyPlaceholder: string;
  signupHint: string;
}

export interface AcousticStats {
  durationSec: number;
  sampleRate: number;
  pitchHz: number | null;
  spectralCentroidHz: number | null;
  rmsDb: number;
  dynamicRangeDb: number;
  peaks: number[];
}

export interface VoiceDspSettings {
  pitchSemitones: number; // -6 to +6
  speed: number; // 0.75 to 1.35
  warmthDb: number; // -6 to +6 (low-shelf @ 220Hz)
  presenceDb: number; // -6 to +6 (high-shelf @ 3400Hz)
}

export interface VoiceProfile {
  id: string;
  name: string;
  isPreset?: boolean;
  createdAt: number;
  baseVoice: BaseVoiceName;
  pitchRegister: string;
  timbreTraits: string[];
  cadence: string;
  accentAndArticulation: string;
  emotionalBaseline: string;
  stylePrompt: string;
  transcript: string;
  acousticStats: AcousticStats;
  dsp: VoiceDspSettings;
  referenceAudioBlob?: Blob;
  referenceMimeType?: string;
  externalProvider?: ProviderId;
  externalVoiceId?: string;
}

export interface GeneratedClip {
  id: string;
  createdAt: number;
  mode: 'single' | 'dialogue';
  voiceId: string;
  voiceName: string;
  secondaryVoiceId?: string;
  secondaryVoiceName?: string;
  text: string;
  emotion: string;
  model: TtsModelName;
  provider?: ProviderId;
  durationSec: number;
  peaks: number[];
  audioBlob: Blob;
  appliedStyle: string;
}

export interface DialogueTurn {
  id: string;
  speakerSlot: 'A' | 'B';
  text: string;
}
