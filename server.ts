import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import net from 'node:net';
import path from 'path';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const PORT = Number(process.env.PORT) || 3000;

const ALLOWED_BASE_VOICES = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'] as const;
type BaseVoiceName = (typeof ALLOWED_BASE_VOICES)[number];

const ALLOWED_PROVIDERS = [
  'gemini',
  'cloudflare',
  'groq',
  'huggingface',
  'elevenlabs',
  'openrouter',
  'custom',
] as const;
type ServerProviderId = (typeof ALLOWED_PROVIDERS)[number];

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp3',
  'audio/mpeg',
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/flac',
]);

function getGeminiClient(customApiKey?: string, apiVersion?: string): GoogleGenAI {
  const apiKey =
    typeof customApiKey === 'string' && customApiKey.trim().length > 0
      ? customApiKey.trim()
      : process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured. Add a custom Gemini API key or switch to a free provider.');
  }
  return new GoogleGenAI({
    apiKey,
    ...(apiVersion ? { apiVersion } : {}),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizeMimeType(mimeType: string): string {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  if (base === 'audio/m4a' || base === 'audio/x-m4a') return 'audio/mp4';
  if (base === 'audio/x-wav' || base === 'audio/wave') return 'audio/wav';
  return base;
}

function mimeToExtension(mimeType: string): string {
  if (mimeType.includes('mp3') || mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('flac')) return 'flac';
  return 'wav';
}

function isBaseVoiceName(value: unknown): value is BaseVoiceName {
  return typeof value === 'string' && (ALLOWED_BASE_VOICES as readonly string[]).includes(value);
}

function isServerProvider(value: unknown): value is ServerProviderId {
  return typeof value === 'string' && (ALLOWED_PROVIDERS as readonly string[]).includes(value);
}

function sanitizeModelId(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 140 || /[\s\r\n?#]/.test(trimmed) || trimmed.includes('..')) {
    return fallback;
  }
  return trimmed;
}

function validateCloudflareAccountId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Cloudflare Account ID is required.');
  }
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(trimmed)) {
    throw new Error('Cloudflare Account ID must be 8–64 alphanumeric characters.');
  }
  return trimmed;
}

function wrapPcmAsWavBase64(pcmBase64: string, mimeType: string): { audioBase64: string; mimeType: string } {
  const raw = Buffer.from(pcmBase64, 'base64');
  // If already a valid RIFF/WAV file, return as-is
  if (raw.length >= 12 && raw.subarray(0, 4).toString('ascii') === 'RIFF') {
    return { audioBase64: pcmBase64, mimeType: 'audio/wav' };
  }
  const lower = mimeType.toLowerCase();
  if (!lower.includes('l16') && !lower.includes('pcm') && !lower.includes('wav')) {
    return { audioBase64: pcmBase64, mimeType };
  }

  const rateMatch = lower.match(/rate=(\d+)/);
  const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = raw.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);

  const wavBuffer = Buffer.concat([header, raw]);
  return {
    audioBase64: wavBuffer.toString('base64'),
    mimeType: 'audio/wav',
  };
}

function isPrivateOrBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '::1' ||
    lower === '0.0.0.0' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }

  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4) {
    const parts = hostname.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
  }
  if (ipVersion === 6) {
    if (lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
      return true;
    }
  }
  return false;
}

function validatePublicHttpsBaseUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new Error('A valid HTTPS base URL is required for the custom endpoint.');
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('Custom endpoint URL is malformed.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Custom endpoint URL must use HTTPS.');
  }
  if (isPrivateOrBlockedHost(parsed.hostname)) {
    throw new Error('Custom endpoint host cannot target local or private network addresses.');
  }
  return parsed.toString().replace(/\/+$/, '');
}

function formatApiError(err: unknown): { status: number; message: string; code?: string } {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const lower = rawMessage.toLowerCase();

  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('401') || lower.includes('403')) {
    return {
      status: 403,
      code: 'API_KEY_ERROR',
      message: rawMessage.includes('API') ? rawMessage : 'Provider API key was rejected or lacks permission.',
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429') || lower.includes('quota') || lower.includes('rate limit')) {
    return {
      status: 429,
      code: 'QUOTA_EXCEEDED',
      message: 'Rate limit or free quota exceeded on the selected provider. Try switching provider or model.',
    };
  }
  if (lower.includes('not configured') || lower.includes('is required')) {
    return {
      status: 400,
      code: 'CONFIG_ERROR',
      message: rawMessage,
    };
  }

  return {
    status: 500,
    code: 'PROVIDER_ERROR',
    message: rawMessage || 'An unexpected error occurred while processing audio.',
  };
}

function buildHeuristicVoiceBlueprint(
  acousticStats: { durationSec?: number; pitchHz?: number | null; spectralCentroidHz?: number | null } | undefined,
  transcript: string,
  customName?: string
) {
  const pitch = Number(acousticStats?.pitchHz || 0);
  const brightness = Number(acousticStats?.spectralCentroidHz || 0);

  let baseVoice: BaseVoiceName = 'Kore';
  let pitchRegister = 'Balanced Mid-Range';
  let timbreTraits = ['Natural', 'Clear', 'Balanced'];

  if (pitch > 0) {
    if (pitch < 125) {
      baseVoice = 'Charon';
      pitchRegister = 'Deep Baritone';
      timbreTraits = ['Grounded', 'Resonant', 'Warm', 'Close-mic'];
    } else if (pitch < 155) {
      baseVoice = 'Fenrir';
      pitchRegister = 'Warm Low-Mid';
      timbreTraits = ['Textured', 'Rich', 'Steady', 'Direct'];
    } else if (pitch < 185) {
      baseVoice = brightness > 2100 ? 'Puck' : 'Kore';
      pitchRegister = brightness > 2100 ? 'Agile Tenor' : 'Warm Alto';
      timbreTraits = ['Expressive', 'Articulate', 'Crisp'];
    } else if (pitch < 220) {
      baseVoice = 'Kore';
      pitchRegister = 'Clear Alto';
      timbreTraits = ['Poised', 'Clear', 'Warm', 'Natural'];
    } else {
      baseVoice = 'Zephyr';
      pitchRegister = 'Bright Soprano';
      timbreTraits = ['Airy', 'Bright', 'Expressive', 'Light'];
    }
  }

  const name =
    typeof customName === 'string' && customName.trim().length > 0
      ? customName.trim().slice(0, 48)
      : `${pitchRegister} Clone`;

  return {
    name,
    baseVoice,
    pitchRegister,
    timbreTraits,
    cadence: 'Natural conversational pacing derived from sample duration and energy',
    accentAndArticulation: 'Clear, balanced articulation',
    emotionalBaseline: 'Grounded and natural',
    stylePrompt: `Speak in a ${pitchRegister.toLowerCase()} voice with ${timbreTraits.slice(0, 3).join(', ').toLowerCase()} tonal qualities and natural conversational phrasing.`,
    recommendedPitchShiftSemitones: 0,
    recommendedSpeed: 1,
    transcript,
  };
}

async function synthesizeWithGemini(params: {
  text: string;
  baseVoice: BaseVoiceName;
  stylePrompt: string;
  model: string;
  customApiKey?: string;
}): Promise<{ audioBase64: string; mimeType: string; usedModel: string }> {
  const { text, baseVoice, stylePrompt, model, customApiKey } = params;
  const isInteractionsTts = model.startsWith('gemini-3.8-');

  if (isInteractionsTts) {
    try {
      const ai = getGeminiClient(customApiKey);
      const interaction = await ai.interactions.create({
        model,
        input: [
          {
            type: 'text',
            text,
            annotations: [
              {
                type: 'speech_metadata',
                style: stylePrompt,
              },
            ],
          },
        ],
        response_format: { type: 'audio' },
        generation_config: {
          speech_config: [
            {
              language: 'en-US',
              voice: baseVoice,
            },
          ],
        },
      });

      const audio = interaction.output_audio;
      if (audio?.data) {
        const wrapped = wrapPcmAsWavBase64(audio.data, audio.mime_type || 'audio/wav');
        return { ...wrapped, usedModel: model };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // If 3.8 TTS is not yet enabled on the key, only auto-fallback when using default 3.8 model
      if (!msg.includes('404') && !msg.toLowerCase().includes('not found')) {
        throw err;
      }
    }
  }

  // v1beta generateContent path (used for gemini-2.5-flash-preview-tts, gemini-2.5-pro-preview-tts, or fallback)
  const targetModel = isInteractionsTts ? 'gemini-2.5-flash-preview-tts' : model;
  const aiBeta = getGeminiClient(customApiKey, 'v1beta');
  const styledPrompt = stylePrompt ? `Speak in this style (${stylePrompt}): ${text}` : text;

  const response = await aiBeta.models.generateContent({
    model: targetModel,
    contents: styledPrompt,
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: baseVoice },
        },
      },
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  const base64Audio = part?.inlineData?.data;
  if (!base64Audio) {
    throw new Error(`Gemini model "${targetModel}" returned empty audio output.`);
  }
  const wrapped = wrapPcmAsWavBase64(base64Audio, part?.inlineData?.mimeType || 'audio/L16;rate=24000');
  return {
    ...wrapped,
    usedModel: targetModel,
  };
}

async function analyzeAudioWithOpenAiCompatibleChat(params: {
  endpointUrl: string;
  apiKey: string;
  model: string;
  transcript: string;
  acousticStats: Record<string, unknown> | undefined;
  customName?: string;
}) {
  const { endpointUrl, apiKey, model, transcript, acousticStats, customName } = params;
  const prompt = `Build a voice cloning acoustic profile JSON from these measurements and speech transcript.
Measurements: ${JSON.stringify(acousticStats || {})}
Transcript: "${transcript || 'Not transcribed'}"

Respond ONLY with valid JSON containing keys:
suggestedName (string), baseVoice (one of Puck, Charon, Kore, Fenrir, Zephyr), pitchRegister (string), timbreTraits (array of 3-4 strings), cadence (string), accentAndArticulation (string), emotionalBaseline (string), stylePrompt (2-3 sentence voice style instruction), recommendedPitchShiftSemitones (number -4 to 4), recommendedSpeed (number 0.85 to 1.2).`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(`${endpointUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are an acoustic voice profiler. Return strict JSON only.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Provider profiling error (${res.status}): ${errText.slice(0, 240)}`);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content || '{}';
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/(\{[\s\S]*\})/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[1] : content);

  const baseVoice: BaseVoiceName = isBaseVoiceName(parsed.baseVoice) ? parsed.baseVoice : 'Kore';
  return {
    name:
      typeof customName === 'string' && customName.trim()
        ? customName.trim().slice(0, 48)
        : String(parsed.suggestedName || 'Cloned Voice').slice(0, 48),
    baseVoice,
    pitchRegister: String(parsed.pitchRegister || 'Balanced Mid-Range'),
    timbreTraits: Array.isArray(parsed.timbreTraits)
      ? parsed.timbreTraits.slice(0, 4).map((t: unknown) => String(t))
      : ['Natural', 'Clear'],
    cadence: String(parsed.cadence || 'Conversational natural phrasing'),
    accentAndArticulation: String(parsed.accentAndArticulation || 'Clear articulation'),
    emotionalBaseline: String(parsed.emotionalBaseline || 'Calm and natural'),
    stylePrompt: String(parsed.stylePrompt || 'Speak in a natural, grounded, articulate voice.'),
    recommendedPitchShiftSemitones: Math.max(-4, Math.min(4, Number(parsed.recommendedPitchShiftSemitones) || 0)),
    recommendedSpeed: Math.max(0.85, Math.min(1.2, Number(parsed.recommendedSpeed) || 1)),
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      apiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.post('/api/providers/test', async (req: Request, res: Response) => {
    try {
      const { provider, apiKey, customBaseUrl, analysisModel, ttsModel } = req.body ?? {};
      const selectedProvider: ServerProviderId = isServerProvider(provider) ? provider : 'gemini';
      const userKey = typeof apiKey === 'string' ? apiKey.trim() : '';

      if (selectedProvider === 'gemini') {
        const modelToTest = sanitizeModelId(analysisModel, 'gemini-3.1-flash-lite');
        const ai = getGeminiClient(userKey || undefined, modelToTest.startsWith('gemini-2.5') ? 'v1beta' : undefined);
        const testRes = await ai.models.generateContent({
          model: modelToTest,
          contents: 'Reply with OK.',
          ...(modelToTest.startsWith('gemini-4')
            ? { config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } }
            : {}),
        });
        res.json({ ok: true, message: `Gemini connected via ${modelToTest} (${(testRes.text || 'OK').trim()}).` });
        return;
      }

      if (!userKey && selectedProvider !== 'custom') {
        res.status(400).json({ error: 'API key is required to test this provider.' });
        return;
      }

      if (selectedProvider === 'cloudflare') {
        const accountId = validateCloudflareAccountId(req.body?.accountId);
        const r = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?per_page=1`,
          { headers: { Authorization: `Bearer ${userKey}` } }
        );
        if (!r.ok) {
          const errText = await r.text();
          throw new Error(`Cloudflare Workers AI returned HTTP ${r.status}: ${errText.slice(0, 180)}`);
        }
        res.json({ ok: true, message: 'Cloudflare Workers AI credentials verified.' });
        return;
      }

      if (selectedProvider === 'groq') {
        const r = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { Authorization: `Bearer ${userKey}` },
        });
        if (!r.ok) throw new Error(`Groq returned HTTP ${r.status}`);
        res.json({ ok: true, message: 'Groq API key verified.' });
        return;
      }

      if (selectedProvider === 'elevenlabs') {
        const r = await fetch('https://api.elevenlabs.io/v1/user', {
          headers: { 'xi-api-key': userKey },
        });
        if (!r.ok) throw new Error(`ElevenLabs returned HTTP ${r.status}`);
        res.json({ ok: true, message: 'ElevenLabs API key verified.' });
        return;
      }

      if (selectedProvider === 'huggingface') {
        const r = await fetch('https://huggingface.co/api/whoami-v2', {
          headers: { Authorization: `Bearer ${userKey}` },
        });
        if (!r.ok) throw new Error(`Hugging Face returned HTTP ${r.status}`);
        res.json({ ok: true, message: 'Hugging Face token verified.' });
        return;
      }

      if (selectedProvider === 'openrouter') {
        const r = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${userKey}` },
        });
        if (!r.ok) throw new Error(`OpenRouter returned HTTP ${r.status}`);
        res.json({ ok: true, message: 'OpenRouter API key verified.' });
        return;
      }

      const base = validatePublicHttpsBaseUrl(customBaseUrl);
      const r = await fetch(`${base}/models`, {
        headers: userKey ? { Authorization: `Bearer ${userKey}` } : {},
      });
      if (!r.ok) {
        throw new Error(`Custom endpoint returned HTTP ${r.status} for ${ttsModel || 'models check'}.`);
      }
      res.json({ ok: true, message: 'Custom HTTPS endpoint verified.' });
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({ error: formatted.message, code: formatted.code });
    }
  });

  app.post('/api/voices/analyze', async (req: Request, res: Response) => {
    try {
      const { audioBase64, mimeType, customName, acousticStats, providerConfig } = req.body ?? {};

      if (typeof audioBase64 !== 'string' || audioBase64.length < 16) {
        res.status(400).json({ error: 'Valid base64 audio data is required.' });
        return;
      }

      if (typeof mimeType !== 'string') {
        res.status(400).json({ error: 'Audio MIME type is required.' });
        return;
      }

      const normalizedMime = normalizeMimeType(mimeType);
      if (!ALLOWED_AUDIO_MIMES.has(normalizedMime)) {
        res.status(400).json({ error: `Unsupported audio format: ${normalizedMime}` });
        return;
      }

      const provider: ServerProviderId = isServerProvider(providerConfig?.provider)
        ? providerConfig.provider
        : 'gemini';
      const userKey = typeof providerConfig?.apiKey === 'string' ? providerConfig.apiKey.trim() : '';

      // 1. ElevenLabs: Real Instant Voice Cloning via /v1/voices/add
      if (provider === 'elevenlabs') {
        if (!userKey) {
          res.status(400).json({ error: 'An ElevenLabs API key is required to clone voices with ElevenLabs.' });
          return;
        }
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const ext = mimeToExtension(normalizedMime);
        const cloneName =
          typeof customName === 'string' && customName.trim()
            ? customName.trim().slice(0, 48)
            : `Cloned Voice ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

        const form = new FormData();
        form.append('name', cloneName);
        form.append('description', 'Cloned via Timbre Studio');
        form.append('files', new Blob([audioBuffer], { type: normalizedMime }), `sample.${ext}`);

        const elRes = await fetch('https://api.elevenlabs.io/v1/voices/add', {
          method: 'POST',
          headers: { 'xi-api-key': userKey },
          body: form,
        });

        if (!elRes.ok) {
          const errBody = await elRes.text();
          throw new Error(`ElevenLabs voice cloning failed (${elRes.status}): ${errBody.slice(0, 280)}`);
        }

        const elData = await elRes.json();
        const blueprint = buildHeuristicVoiceBlueprint(acousticStats, '', cloneName);
        res.json({
          transcript: '',
          profile: {
            ...blueprint,
            externalProvider: 'elevenlabs',
            externalVoiceId: elData.voice_id,
          },
        });
        return;
      }

      // 2. Cloudflare Workers AI: Whisper transcription + Llama vocal profiling
      if (provider === 'cloudflare') {
        if (!userKey) {
          res.status(400).json({ error: 'A Cloudflare Workers AI API token is required.' });
          return;
        }
        const accountId = validateCloudflareAccountId(providerConfig?.accountId);
        const audioBuffer = Buffer.from(audioBase64, 'base64');

        // Step A: Transcribe via Whisper on Workers AI
        let transcript = '';
        try {
          const whisperModel =
            typeof providerConfig?.analysisModel === 'string' &&
            providerConfig.analysisModel.includes('whisper')
              ? sanitizeModelId(providerConfig.analysisModel, '@cf/openai/whisper-large-v3-turbo')
              : '@cf/openai/whisper-large-v3-turbo';

          const trRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${whisperModel}`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${userKey}`,
                'Content-Type': whisperModel.includes('turbo')
                  ? 'application/json'
                  : 'application/octet-stream',
              },
              body: whisperModel.includes('turbo')
                ? JSON.stringify({ audio: audioBase64 })
                : audioBuffer,
            }
          );
          if (trRes.ok) {
            const trData = await trRes.json();
            transcript = String(trData?.result?.text || '').trim();
          }
        } catch {
          // Continue with DSP profiling even if transcription is empty
        }

        // Step B: If selected analysis model is an LLM (not whisper-only), refine profile with Workers AI LLM
        const chosenAnalysis = sanitizeModelId(
          providerConfig?.analysisModel,
          '@cf/meta/llama-3.1-8b-instruct-fast'
        );
        if (!chosenAnalysis.includes('whisper')) {
          try {
            const llmRes = await fetch(
              `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${chosenAnalysis}`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${userKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  messages: [
                    {
                      role: 'system',
                      content: 'You are an acoustic voice profiler. Return strict JSON only.',
                    },
                    {
                      role: 'user',
                      content: `Build a voice cloning profile JSON from measurements ${JSON.stringify(
                        acousticStats || {}
                      )} and transcript "${transcript}". Keys: suggestedName, baseVoice (Puck|Charon|Kore|Fenrir|Zephyr), pitchRegister, timbreTraits (array of 3-4 strings), cadence, accentAndArticulation, emotionalBaseline, stylePrompt, recommendedPitchShiftSemitones (-4 to 4), recommendedSpeed (0.85 to 1.2).`,
                    },
                  ],
                }),
              }
            );
            if (llmRes.ok) {
              const llmData = await llmRes.json();
              const content = String(llmData?.result?.response || '');
              const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/(\{[\s\S]*\})/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[1]);
                const baseVoice: BaseVoiceName = isBaseVoiceName(parsed.baseVoice) ? parsed.baseVoice : 'Kore';
                res.json({
                  transcript,
                  profile: {
                    name:
                      typeof customName === 'string' && customName.trim()
                        ? customName.trim().slice(0, 48)
                        : String(parsed.suggestedName || 'Cloned Voice').slice(0, 48),
                    baseVoice,
                    pitchRegister: String(parsed.pitchRegister || 'Balanced Mid-Range'),
                    timbreTraits: Array.isArray(parsed.timbreTraits)
                      ? parsed.timbreTraits.slice(0, 4).map((t: unknown) => String(t))
                      : ['Natural', 'Clear'],
                    cadence: String(parsed.cadence || 'Conversational natural phrasing'),
                    accentAndArticulation: String(parsed.accentAndArticulation || 'Clear articulation'),
                    emotionalBaseline: String(parsed.emotionalBaseline || 'Calm and natural'),
                    stylePrompt: String(parsed.stylePrompt || 'Speak in a natural, grounded voice.'),
                    recommendedPitchShiftSemitones: Math.max(
                      -4,
                      Math.min(4, Number(parsed.recommendedPitchShiftSemitones) || 0)
                    ),
                    recommendedSpeed: Math.max(0.85, Math.min(1.2, Number(parsed.recommendedSpeed) || 1)),
                  },
                });
                return;
              }
            }
          } catch {
            // Fall through to DSP blueprint
          }
        }

        const blueprint = buildHeuristicVoiceBlueprint(acousticStats, transcript, customName);
        res.json({ transcript, profile: blueprint });
        return;
      }

      // 3. Groq: Whisper transcription + Llama acoustic blueprint
      if (provider === 'groq') {
        if (!userKey) {
          res.status(400).json({ error: 'A Groq API key is required when Groq is selected.' });
          return;
        }
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const ext = mimeToExtension(normalizedMime);
        const form = new FormData();
        form.append('file', new Blob([audioBuffer], { type: normalizedMime }), `sample.${ext}`);
        form.append('model', 'whisper-large-v3-turbo');

        const trRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${userKey}` },
          body: form,
        });

        let transcript = '';
        if (trRes.ok) {
          const trData = await trRes.json();
          transcript = String(trData.text || '').trim();
        }

        const analysisModel = sanitizeModelId(providerConfig?.analysisModel, 'llama-3.3-70b-versatile');
        const profile = await analyzeAudioWithOpenAiCompatibleChat({
          endpointUrl: 'https://api.groq.com/openai/v1',
          apiKey: userKey,
          model: analysisModel,
          transcript,
          acousticStats,
          customName,
        });

        res.json({ transcript, profile });
        return;
      }

      // 3. Hugging Face: Whisper transcription + DSP blueprint
      if (provider === 'huggingface') {
        if (!userKey) {
          res.status(400).json({ error: 'A Hugging Face token is required when Hugging Face is selected.' });
          return;
        }
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const trModel = sanitizeModelId(providerConfig?.analysisModel, 'openai/whisper-large-v3-turbo');
        const hfRes = await fetch(`https://router.huggingface.co/hf-inference/models/${trModel}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${userKey}`,
            'Content-Type': normalizedMime,
          },
          body: audioBuffer,
        });

        let transcript = '';
        if (hfRes.ok) {
          const hfData = await hfRes.json();
          transcript = String(hfData?.text || '').trim();
        }

        const blueprint = buildHeuristicVoiceBlueprint(acousticStats, transcript, customName);
        res.json({ transcript, profile: blueprint });
        return;
      }

      // 4. OpenRouter / Custom OpenAI-compatible endpoint
      if (provider === 'openrouter' || provider === 'custom') {
        const endpointUrl =
          provider === 'openrouter'
            ? 'https://openrouter.ai/api/v1'
            : validatePublicHttpsBaseUrl(providerConfig?.customBaseUrl);
        const analysisModel = sanitizeModelId(
          providerConfig?.analysisModel,
          provider === 'openrouter' ? 'meta-llama/llama-3.3-70b-instruct:free' : 'gpt-4o-mini'
        );

        const profile = await analyzeAudioWithOpenAiCompatibleChat({
          endpointUrl,
          apiKey: userKey,
          model: analysisModel,
          transcript: '',
          acousticStats,
          customName,
        });

        res.json({ transcript: '', profile });
        return;
      }

      // 5. Default: Gemini (built-in server key or user's custom Gemini key + custom model)
      const requestedModel = sanitizeModelId(providerConfig?.analysisModel, 'gemini-3.1-flash-lite');
      const ai = getGeminiClient(userKey || undefined, requestedModel.startsWith('gemini-2.5') ? 'v1beta' : undefined);

      const acousticContext = acousticStats && typeof acousticStats === 'object'
        ? `Measured DSP acoustics from audio waveform: duration=${Number(acousticStats.durationSec || 0).toFixed(1)}s, fundamentalPitchHz=${acousticStats.pitchHz ? Math.round(Number(acousticStats.pitchHz)) : 'unknown'}, spectralCentroidHz=${acousticStats.spectralCentroidHz ? Math.round(Number(acousticStats.spectralCentroidHz)) : 'unknown'}, dynamicRangeDb=${Number(acousticStats.dynamicRangeDb || 0).toFixed(1)}.`
        : '';

      const audioPart = {
        inlineData: {
          mimeType: normalizedMime,
          data: audioBase64,
        },
      };

      const promptText = `Listen carefully to the speaker's voice in this audio recording. First transcribe what was spoken, and construct an acoustic voice cloning blueprint for Text-to-Speech Voice Design.
${acousticContext}

Choose the single closest acoustic foundation from these 5 prebuilt voices:
- Charon: deep, resonant, grounded lower-register male voice
- Fenrir: textured, warm, assertive mid-low male voice
- Puck: bright, agile, energetic tenor / youthful mid voice
- Kore: clear, warm, poised mid-alto / soprano female voice
- Zephyr: soft, airy, expressive higher-register female voice

Also estimate recommendedPitchShiftSemitones (-4.0 to +4.0) and recommendedSpeed (0.85 to 1.20).
Write a rich, specific stylePrompt (2-3 crisp sentences) describing vocal timbre, resonance, breathiness, cadence, pause rhythm, accent, and emotional delivery.`;

      const schema = {
        type: Type.OBJECT,
        properties: {
          transcript: { type: Type.STRING },
          suggestedName: { type: Type.STRING },
          baseVoice: { type: Type.STRING },
          pitchRegister: { type: Type.STRING },
          timbreTraits: { type: Type.ARRAY, items: { type: Type.STRING } },
          cadence: { type: Type.STRING },
          accentAndArticulation: { type: Type.STRING },
          emotionalBaseline: { type: Type.STRING },
          stylePrompt: { type: Type.STRING },
          recommendedPitchShiftSemitones: { type: Type.NUMBER },
          recommendedSpeed: { type: Type.NUMBER },
        },
        required: [
          'transcript',
          'suggestedName',
          'baseVoice',
          'pitchRegister',
          'timbreTraits',
          'cadence',
          'accentAndArticulation',
          'emotionalBaseline',
          'stylePrompt',
          'recommendedPitchShiftSemitones',
          'recommendedSpeed',
        ],
      };

      const isGemini4 = requestedModel.startsWith('gemini-4');
      let analysisResponse;
      try {
        analysisResponse = await ai.models.generateContent({
          model: requestedModel,
          contents: { parts: [audioPart, { text: promptText }] },
          config: {
            ...(isGemini4 ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (requestedModel !== 'gemini-3.1-flash-lite' && (msg.includes('404') || msg.toLowerCase().includes('not found'))) {
          const fallbackAi = getGeminiClient(userKey || undefined);
          analysisResponse = await fallbackAi.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: { parts: [audioPart, { text: promptText }] },
            config: {
              responseMimeType: 'application/json',
              responseSchema: schema,
            },
          });
        } else {
          throw err;
        }
      }

      const rawJson = (analysisResponse.text ?? '{}').trim();
      const parsed = JSON.parse(rawJson);

      const baseVoice: BaseVoiceName = isBaseVoiceName(parsed.baseVoice) ? parsed.baseVoice : 'Kore';
      const pitchShift = Math.max(-4, Math.min(4, Number(parsed.recommendedPitchShiftSemitones) || 0));
      const speed = Math.max(0.85, Math.min(1.2, Number(parsed.recommendedSpeed) || 1));

      const cleanName =
        typeof customName === 'string' && customName.trim().length > 0
          ? customName.trim().slice(0, 48)
          : String(parsed.suggestedName || 'Cloned Voice').slice(0, 48);

      res.json({
        transcript: String(parsed.transcript || '').trim(),
        profile: {
          name: cleanName,
          baseVoice,
          pitchRegister: String(parsed.pitchRegister || 'Balanced Mid-Range'),
          timbreTraits: Array.isArray(parsed.timbreTraits)
            ? parsed.timbreTraits.slice(0, 4).map((t: unknown) => String(t))
            : ['Natural', 'Clear'],
          cadence: String(parsed.cadence || 'Conversational natural phrasing'),
          accentAndArticulation: String(parsed.accentAndArticulation || 'Neutral, clear articulation'),
          emotionalBaseline: String(parsed.emotionalBaseline || 'Calm and natural'),
          stylePrompt: String(parsed.stylePrompt || 'Speak in a natural, grounded, articulate voice.'),
          recommendedPitchShiftSemitones: Math.round(pitchShift * 10) / 10,
          recommendedSpeed: Math.round(speed * 100) / 100,
        },
      });
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({ error: formatted.message, code: formatted.code });
    }
  });

  app.post('/api/tts/generate', async (req: Request, res: Response) => {
    try {
      const { text, baseVoice, stylePrompt, emotion, model, providerConfig, externalVoiceId } = req.body ?? {};

      if (typeof text !== 'string' || text.trim().length === 0) {
        res.status(400).json({ error: 'Text to synthesize is required.' });
        return;
      }

      const trimmedText = text.trim();
      if (trimmedText.length > 5000) {
        res.status(400).json({ error: 'Text exceeds maximum length of 5,000 characters.' });
        return;
      }

      const voiceName: BaseVoiceName = isBaseVoiceName(baseVoice) ? baseVoice : 'Kore';
      const baseStyle =
        typeof stylePrompt === 'string' && stylePrompt.trim().length > 0
          ? stylePrompt.trim()
          : 'Natural, clear, expressive studio delivery.';
      const emotionNote =
        typeof emotion === 'string' && emotion.trim().length > 0 && emotion !== 'Natural'
          ? ` Delivery mood: ${emotion.trim()}.`
          : '';
      const combinedStyle = `${baseStyle}${emotionNote}`.slice(0, 600);

      const provider: ServerProviderId = isServerProvider(providerConfig?.provider)
        ? providerConfig.provider
        : 'gemini';
      const userKey = typeof providerConfig?.apiKey === 'string' ? providerConfig.apiKey.trim() : '';

      // 1. ElevenLabs TTS
      if (provider === 'elevenlabs') {
        if (!userKey) {
          res.status(400).json({ error: 'An ElevenLabs API key is required.' });
          return;
        }
        const voiceId =
          sanitizeModelId(externalVoiceId, '') ||
          sanitizeModelId(providerConfig?.customVoiceId, '21m00Tcm4TlvDq8ikWAM');
        const elModel = sanitizeModelId(providerConfig?.ttsModel || model, 'eleven_flash_v2_5');

        const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
          method: 'POST',
          headers: {
            'xi-api-key': userKey,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text: trimmedText,
            model_id: elModel,
          }),
        });

        if (!elRes.ok) {
          const errText = await elRes.text();
          throw new Error(`ElevenLabs TTS failed (${elRes.status}): ${errText.slice(0, 240)}`);
        }

        const audioBuf = Buffer.from(await elRes.arrayBuffer());
        res.json({
          audioBase64: audioBuf.toString('base64'),
          mimeType: 'audio/mpeg',
          appliedStyle: `ElevenLabs (${elModel})`,
        });
        return;
      }

      // 2. Cloudflare Workers AI TTS (@cf/myshell-ai/melotts, @cf/deepgram/aura-1, @cf/deepgram/aura-2-en)
      if (provider === 'cloudflare') {
        if (!userKey) {
          res.status(400).json({ error: 'A Cloudflare Workers AI API token is required.' });
          return;
        }
        const accountId = validateCloudflareAccountId(providerConfig?.accountId);
        const cfModel = sanitizeModelId(providerConfig?.ttsModel || model, '@cf/myshell-ai/melotts');
        const isMelo = cfModel.includes('melotts');

        const auraSpeakerMap: Record<BaseVoiceName, string> = {
          Charon: 'orion',
          Fenrir: 'zeus',
          Puck: 'perseus',
          Kore: 'asteria',
          Zephyr: 'luna',
        };
        const speaker = sanitizeModelId(providerConfig?.customVoiceId, auraSpeakerMap[voiceName]);

        const payload = isMelo
          ? { prompt: trimmedText, lang: 'en' }
          : { text: trimmedText, speaker };

        const cfRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${cfModel}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${userKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          }
        );

        if (!cfRes.ok) {
          const errText = await cfRes.text();
          throw new Error(`Cloudflare Workers AI TTS failed (${cfRes.status}): ${errText.slice(0, 240)}`);
        }

        const ct = (cfRes.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('application/json')) {
          const jsonData = await cfRes.json();
          const b64 = jsonData?.result?.audio;
          if (!b64 || typeof b64 !== 'string') {
            throw new Error(`Cloudflare model "${cfModel}" returned no audio data.`);
          }
          res.json({
            audioBase64: b64,
            mimeType: 'audio/mpeg',
            appliedStyle: `Cloudflare ${cfModel}`,
          });
          return;
        }

        const audioBuf = Buffer.from(await cfRes.arrayBuffer());
        res.json({
          audioBase64: audioBuf.toString('base64'),
          mimeType: ct || 'audio/mpeg',
          appliedStyle: `Cloudflare ${cfModel} (${speaker})`,
        });
        return;
      }

      // 3. Groq TTS
      if (provider === 'groq') {
        if (!userKey) {
          res.status(400).json({ error: 'A Groq API key is required.' });
          return;
        }
        const groqModel = sanitizeModelId(providerConfig?.ttsModel || model, 'playai-tts');
        const groqVoiceMap: Record<BaseVoiceName, string> = {
          Charon: 'Atlas-PlayAI',
          Fenrir: 'Basil-PlayAI',
          Puck: 'Briggs-PlayAI',
          Kore: 'Celeste-PlayAI',
          Zephyr: 'Cheyenne-PlayAI',
        };
        const chosenVoice = sanitizeModelId(providerConfig?.customVoiceId, groqVoiceMap[voiceName]);

        const groqRes = await fetch('https://api.groq.com/openai/v1/audio/speech', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${userKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: groqModel,
            input: trimmedText,
            voice: chosenVoice,
            response_format: 'wav',
          }),
        });

        if (!groqRes.ok) {
          const errText = await groqRes.text();
          throw new Error(`Groq TTS failed (${groqRes.status}): ${errText.slice(0, 240)}`);
        }

        const audioBuf = Buffer.from(await groqRes.arrayBuffer());
        res.json({
          audioBase64: audioBuf.toString('base64'),
          mimeType: 'audio/wav',
          appliedStyle: `Groq ${groqModel} (${chosenVoice})`,
        });
        return;
      }

      // 3. Hugging Face Inference TTS
      if (provider === 'huggingface') {
        if (!userKey) {
          res.status(400).json({ error: 'A Hugging Face token is required.' });
          return;
        }
        const hfModel = sanitizeModelId(providerConfig?.ttsModel || model, 'facebook/mms-tts-eng');
        const hfRes = await fetch(`https://router.huggingface.co/hf-inference/models/${hfModel}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${userKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ inputs: trimmedText }),
        });

        if (!hfRes.ok) {
          const errText = await hfRes.text();
          throw new Error(`Hugging Face TTS failed (${hfRes.status}): ${errText.slice(0, 240)}`);
        }

        const ct = hfRes.headers.get('content-type') || 'audio/flac';
        const audioBuf = Buffer.from(await hfRes.arrayBuffer());
        res.json({
          audioBase64: audioBuf.toString('base64'),
          mimeType: ct,
          appliedStyle: `Hugging Face (${hfModel})`,
        });
        return;
      }

      // 4. Custom OpenAI-compatible /audio/speech endpoint
      if (provider === 'custom') {
        const endpointUrl = validatePublicHttpsBaseUrl(providerConfig?.customBaseUrl);
        const customModel = sanitizeModelId(providerConfig?.ttsModel || model, 'tts-1');
        const customVoice = sanitizeModelId(providerConfig?.customVoiceId, voiceName.toLowerCase());

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (userKey) headers['Authorization'] = `Bearer ${userKey}`;

        const customRes = await fetch(`${endpointUrl}/audio/speech`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: customModel,
            input: trimmedText,
            voice: customVoice,
            response_format: 'wav',
          }),
        });

        if (!customRes.ok) {
          const errText = await customRes.text();
          throw new Error(`Custom TTS endpoint failed (${customRes.status}): ${errText.slice(0, 240)}`);
        }

        const ct = customRes.headers.get('content-type') || 'audio/wav';
        const audioBuf = Buffer.from(await customRes.arrayBuffer());
        res.json({
          audioBase64: audioBuf.toString('base64'),
          mimeType: ct,
          appliedStyle: `Custom (${customModel})`,
        });
        return;
      }

      if (provider === 'openrouter') {
        res.status(400).json({
          error:
            'OpenRouter provides text/analysis models only. Switch to Gemini, Groq, Hugging Face, ElevenLabs, Custom Endpoint, or Browser Native Speech for audio synthesis.',
        });
        return;
      }

      // 5. Default Gemini TTS
      const ttsModel = sanitizeModelId(providerConfig?.ttsModel || model, 'gemini-2.5-flash-preview-tts');
      const result = await synthesizeWithGemini({
        text: trimmedText,
        baseVoice: voiceName,
        stylePrompt: combinedStyle,
        model: ttsModel,
        customApiKey: userKey || undefined,
      });

      res.json({
        audioBase64: result.audioBase64,
        mimeType: result.mimeType,
        appliedStyle: `${result.usedModel} · ${combinedStyle}`,
      });
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({ error: formatted.message, code: formatted.code });
    }
  });

  app.post('/api/tts/dialogue', async (req: Request, res: Response) => {
    try {
      const { speakerA, speakerB, lines, providerConfig } = req.body ?? {};

      if (!speakerA || !speakerB || !Array.isArray(lines) || lines.length === 0) {
        res.status(400).json({ error: 'Two speakers and at least one dialogue line are required.' });
        return;
      }

      if (lines.length > 30) {
        res.status(400).json({ error: 'Dialogue supports up to 30 turns per generation.' });
        return;
      }

      const nameA = String(speakerA.name || 'Speaker A').replace(/[:\n\r]/g, '').trim() || 'Speaker A';
      let nameB = String(speakerB.name || 'Speaker B').replace(/[:\n\r]/g, '').trim() || 'Speaker B';
      if (nameA === nameB) {
        nameB = `${nameB} 2`;
      }

      const baseVoiceA: BaseVoiceName = isBaseVoiceName(speakerA.baseVoice) ? speakerA.baseVoice : 'Charon';
      const baseVoiceB: BaseVoiceName = isBaseVoiceName(speakerB.baseVoice) ? speakerB.baseVoice : 'Kore';

      const styleA = String(speakerA.stylePrompt || 'Warm, natural conversational tone.').slice(0, 400);
      const styleB = String(speakerB.stylePrompt || 'Articulate, expressive conversational tone.').slice(0, 400);

      const cleanLines = lines.filter(
        (l: { text?: unknown }) => typeof l?.text === 'string' && l.text.trim().length > 0
      );
      if (cleanLines.length === 0) {
        res.status(400).json({ error: 'Please provide text for at least one dialogue line.' });
        return;
      }

      const userKey = typeof providerConfig?.apiKey === 'string' ? providerConfig.apiKey.trim() : '';
      const ttsModel = sanitizeModelId(providerConfig?.ttsModel, 'gemini-2.5-flash-preview-tts');

      if (ttsModel.startsWith('gemini-3.8-')) {
        try {
          const ai = getGeminiClient(userKey || undefined);
          const inputBlocks = cleanLines.map((l: { speakerSlot: string; text: string }) => {
            const isA = l.speakerSlot === 'A';
            const speakerLabel = isA ? nameA : nameB;
            const style = isA ? styleA : styleB;
            return {
              type: 'text' as const,
              text: `${speakerLabel}: ${l.text.trim()}`,
              annotations: [
                {
                  type: 'speech_metadata' as const,
                  speaker: speakerLabel,
                  style,
                },
              ],
            };
          });

          const interaction = await ai.interactions.create({
            model: ttsModel,
            input: inputBlocks,
            response_format: { type: 'audio' },
            generation_config: {
              speech_config: {
                speakers: [
                  { speaker: nameA, voice: baseVoiceA },
                  { speaker: nameB, voice: baseVoiceB },
                ],
              },
            },
          });

          const audio = interaction.output_audio;
          if (audio?.data) {
            const wrapped = wrapPcmAsWavBase64(audio.data, audio.mime_type || 'audio/wav');
            res.json({
              audioBase64: wrapped.audioBase64,
              mimeType: wrapped.mimeType,
              appliedStyle: `${nameA} (${baseVoiceA}) & ${nameB} (${baseVoiceB})`,
            });
            return;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!msg.includes('404') && !msg.toLowerCase().includes('not found')) {
            throw err;
          }
        }
      }

      // v1beta multiSpeakerVoiceConfig fallback / direct gemini-2.5-*-tts path
      const fallbackModel = ttsModel.startsWith('gemini-3.8-') ? 'gemini-2.5-flash-preview-tts' : ttsModel;
      const aiBeta = getGeminiClient(userKey || undefined, 'v1beta');
      const scriptText = cleanLines
        .map((l: { speakerSlot: string; text: string }) => {
          const speakerLabel = l.speakerSlot === 'A' ? nameA : nameB;
          return `${speakerLabel}: ${l.text.trim()}`;
        })
        .join('\n');

      const response = await aiBeta.models.generateContent({
        model: fallbackModel,
        contents: `TTS the following conversation between ${nameA} (${styleA}) and ${nameB} (${styleB}):\n${scriptText}`,
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                {
                  speaker: nameA,
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: baseVoiceA } },
                },
                {
                  speaker: nameB,
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: baseVoiceB } },
                },
              ],
            },
          },
        },
      });

      const part = response.candidates?.[0]?.content?.parts?.[0];
      const base64Audio = part?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'Dialogue synthesis returned empty audio output.' });
        return;
      }

      const wrapped = wrapPcmAsWavBase64(base64Audio, part?.inlineData?.mimeType || 'audio/L16;rate=24000');
      res.json({
        audioBase64: wrapped.audioBase64,
        mimeType: wrapped.mimeType,
        appliedStyle: `${fallbackModel} · ${nameA} & ${nameB}`,
      });
    } catch (err) {
      const formatted = formatApiError(err);
      res.status(formatted.status).json({ error: formatted.message, code: formatted.code });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Timbre Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
