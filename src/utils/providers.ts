import { ProviderConfig, ProviderId, ProviderPreset, VoiceProfile } from '../types/voice';

const CONFIG_STORAGE_KEY = 'timbre_provider_config_v1';
const KEYS_STORAGE_KEY = 'timbre_provider_keys_v1';

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'gemini',
    name: 'Google Gemini (Default)',
    tierNote: 'Built-in default key · Optional custom key & model',
    requiresKey: false,
    supportsVoiceCloning: true,
    supportsTts: true,
    supportsDialogue: true,
    defaultAnalysisModel: 'gemini-3.1-flash-lite',
    suggestedAnalysisModels: [
      'gemini-3.1-flash-lite',
      'gemini-4-hydrogen',
      'gemini-4-neon',
    ],
    defaultTtsModel: 'gemini-2.5-flash-preview-tts',
    suggestedTtsModels: [
      'gemini-2.5-flash-preview-tts',
      'gemini-2.5-pro-preview-tts',
      'gemini-3.8-flash-tts',
      'gemini-3.8-flash-lite-tts',
    ],
    keyPlaceholder: 'Optional custom AIza... key (leave blank for built-in default)',
    signupHint: 'Uses the built-in server key by default. Enter a custom Gemini key only if you want to override it.',
  },
  {
    id: 'browser',
    name: 'Browser Native Speech',
    tierNote: '100% Free · Zero API Key · Always Available',
    requiresKey: false,
    supportsVoiceCloning: true,
    supportsTts: true,
    supportsDialogue: false,
    defaultAnalysisModel: 'web-audio-dsp',
    suggestedAnalysisModels: ['web-audio-dsp'],
    defaultTtsModel: 'web-speech-synthesis',
    suggestedTtsModels: ['web-speech-synthesis'],
    keyPlaceholder: 'No API key required',
    signupHint: 'Uses local Web Audio DSP for voice profiling and your browser/OS speech engine for instant playback.',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare Workers AI',
    tierNote: 'Free Tier (10k Neurons/day) · MeloTTS, Aura & Whisper',
    requiresKey: true,
    supportsVoiceCloning: true,
    supportsTts: true,
    supportsDialogue: false,
    defaultAnalysisModel: '@cf/meta/llama-3.1-8b-instruct-fast',
    suggestedAnalysisModels: [
      '@cf/meta/llama-3.1-8b-instruct-fast',
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      '@cf/openai/whisper-large-v3-turbo',
      '@cf/openai/whisper',
    ],
    defaultTtsModel: '@cf/myshell-ai/melotts',
    suggestedTtsModels: [
      '@cf/myshell-ai/melotts',
      '@cf/deepgram/aura-1',
      '@cf/deepgram/aura-2-en',
    ],
    keyPlaceholder: 'Cloudflare Workers AI API Token',
    signupHint: 'Free daily Neurons at dash.cloudflare.com. Requires your Cloudflare Account ID and a Workers AI API Token.',
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    tierNote: 'Free Tier API Key · Whisper + Llama + PlayAI TTS',
    requiresKey: true,
    supportsVoiceCloning: true,
    supportsTts: true,
    supportsDialogue: false,
    defaultAnalysisModel: 'llama-3.3-70b-versatile',
    suggestedAnalysisModels: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
    ],
    defaultTtsModel: 'playai-tts',
    suggestedTtsModels: ['playai-tts', 'canopylabs/orpheus-v1-english'],
    keyPlaceholder: 'gsk_...',
    signupHint: 'Free API keys at console.groq.com. Uses whisper-large-v3-turbo for transcription.',
  },
  {
    id: 'huggingface',
    name: 'Hugging Face Inference',
    tierNote: 'Free Tier Token · Open-Source TTS Models',
    requiresKey: true,
    supportsVoiceCloning: true,
    supportsTts: true,
    supportsDialogue: false,
    defaultAnalysisModel: 'openai/whisper-large-v3-turbo',
    suggestedAnalysisModels: [
      'openai/whisper-large-v3-turbo',
      'openai/whisper-large-v3',
    ],
    defaultTtsModel: 'facebook/mms-tts-eng',
    suggestedTtsModels: [
      'facebook/mms-tts-eng',
      'espnet/kan-bayashi_ljspeech_vits',
      'microsoft/speecht5_tts',
      'hexgrad/Kokoro-82M',
    ],
    keyPlaceholder: 'hf_...',
    signupHint: 'Free access tokens at huggingface.co/settings/tokens. Enter any open TTS repo ID as a custom model.',
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    tierNote: 'Free Tier Key · True Audio Voice Cloning',
    requiresKey: true,
    supportsVoiceCloning: true,
    supportsTts: true,
    supportsDialogue: false,
    defaultAnalysisModel: 'instant-voice-clone',
    suggestedAnalysisModels: ['instant-voice-clone'],
    defaultTtsModel: 'eleven_flash_v2_5',
    suggestedTtsModels: [
      'eleven_flash_v2_5',
      'eleven_multilingual_v2',
      'eleven_turbo_v2_5',
    ],
    keyPlaceholder: 'xi-... or sk_...',
    signupHint: 'Free tier includes 10k monthly credits and instant voice cloning via /v1/voices/add.',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter (Profiling Only)',
    tierNote: 'Free Models Available · Voice Analysis',
    requiresKey: true,
    supportsVoiceCloning: true,
    supportsTts: false,
    supportsDialogue: false,
    defaultAnalysisModel: 'meta-llama/llama-3.3-70b-instruct:free',
    suggestedAnalysisModels: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemma-3-27b-it:free',
      'mistralai/mistral-small-3.1-24b-instruct:free',
    ],
    defaultTtsModel: 'none',
    suggestedTtsModels: [],
    keyPlaceholder: 'sk-or-v1-...',
    signupHint: 'Free LLM models for vocal blueprint profiling. Pair with Gemini, Groq, Hugging Face, or Browser Speech for TTS.',
  },
  {
    id: 'custom',
    name: 'Custom HTTPS Endpoint',
    tierNote: 'OpenAI-Compatible · Custom Base URL & Model',
    requiresKey: false,
    supportsVoiceCloning: true,
    supportsTts: true,
    supportsDialogue: false,
    defaultAnalysisModel: 'gpt-4o-mini',
    suggestedAnalysisModels: ['gpt-4o-mini'],
    defaultTtsModel: 'tts-1',
    suggestedTtsModels: ['tts-1', 'tts-1-hd', 'kokoro'],
    keyPlaceholder: 'Optional Bearer token',
    signupHint: 'Connect any public HTTPS OpenAI-compatible /chat/completions and /audio/speech server.',
  },
];

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  provider: 'gemini',
  apiKey: '',
  accountId: '',
  customBaseUrl: '',
  analysisModel: 'gemini-3.1-flash-lite',
  ttsModel: 'gemini-2.5-flash-preview-tts',
  customVoiceId: '',
};

export function getProviderPreset(id: ProviderId): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.id === id) || PROVIDER_PRESETS[0];
}

export function loadProviderKeysMap(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(KEYS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveProviderKey(provider: ProviderId, apiKey: string): void {
  try {
    const map = loadProviderKeysMap();
    if (apiKey.trim()) {
      map[provider] = apiKey.trim();
    } else {
      delete map[provider];
    }
    sessionStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadProviderConfig(): ProviderConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    const keys = loadProviderKeysMap();
    if (!raw) {
      return {
        ...DEFAULT_PROVIDER_CONFIG,
        apiKey: keys.gemini || '',
      };
    }
    const parsed = JSON.parse(raw) as Partial<ProviderConfig>;
    const provider: ProviderId = PROVIDER_PRESETS.some((p) => p.id === parsed.provider)
      ? (parsed.provider as ProviderId)
      : 'gemini';
    const preset = getProviderPreset(provider);

    return {
      provider,
      apiKey: keys[provider] || '',
      accountId: parsed.accountId || '',
      customBaseUrl: parsed.customBaseUrl || '',
      analysisModel: parsed.analysisModel || preset.defaultAnalysisModel,
      ttsModel: parsed.ttsModel || preset.defaultTtsModel,
      customVoiceId: parsed.customVoiceId || '',
    };
  } catch {
    return DEFAULT_PROVIDER_CONFIG;
  }
}

export function saveProviderConfig(config: ProviderConfig): void {
  saveProviderKey(config.provider, config.apiKey);
  try {
    const nonSecret = {
      provider: config.provider,
      accountId: config.accountId || '',
      customBaseUrl: config.customBaseUrl,
      analysisModel: config.analysisModel,
      ttsModel: config.ttsModel,
      customVoiceId: config.customVoiceId,
    };
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(nonSecret));
  } catch {
    // Ignore storage errors
  }
}

export function speakWithBrowserSynthesis(params: {
  text: string;
  voice: VoiceProfile;
  preferredBrowserVoiceName?: string;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: string) => void;
}): () => void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    params.onError?.('Web Speech API is not supported in this browser.');
    return () => {};
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(params.text);

  const available = window.speechSynthesis.getVoices();
  if (available.length > 0) {
    if (params.preferredBrowserVoiceName) {
      const exact = available.find((v) => v.name === params.preferredBrowserVoiceName);
      if (exact) utterance.voice = exact;
    } else {
      const isHigherPitch =
        params.voice.baseVoice === 'Kore' ||
        params.voice.baseVoice === 'Zephyr' ||
        (params.voice.acousticStats.pitchHz ?? 0) > 175;
      const enVoices = available.filter((v) => v.lang.startsWith('en'));
      const pool = enVoices.length > 0 ? enVoices : available;
      const matched = pool.find((v) =>
        isHigherPitch
          ? /female|samantha|victoria|karen|zira|aria|jenny|google uk english female/i.test(v.name)
          : /male|daniel|alex|david|guy|ryan|google uk english male/i.test(v.name)
      );
      utterance.voice = matched || pool[0];
    }
  }

  // Map DSP pitch semitones & acoustic fundamental Hz to Web Speech pitch (0.5 .. 2.0)
  const baseHz = params.voice.acousticStats.pitchHz;
  let pitchRatio = 1.0;
  if (baseHz && baseHz > 60) {
    pitchRatio = Math.max(0.65, Math.min(1.5, baseHz / 155));
  }
  const semitoneFactor = Math.pow(2, params.voice.dsp.pitchSemitones / 12);
  utterance.pitch = Math.max(0.5, Math.min(2.0, pitchRatio * semitoneFactor));
  utterance.rate = Math.max(0.6, Math.min(1.8, params.voice.dsp.speed));

  utterance.onstart = () => params.onStart?.();
  utterance.onend = () => params.onEnd?.();
  utterance.onerror = (e) => params.onError?.(`Browser speech error: ${e.error}`);

  window.speechSynthesis.speak(utterance);
  return () => window.speechSynthesis.cancel();
}
