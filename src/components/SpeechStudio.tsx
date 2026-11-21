import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, Play, RotateCcw, Sliders, Square, Volume2 } from 'lucide-react';
import { GeneratedClip, ProviderConfig, VoiceDspSettings, VoiceProfile } from '../types/voice';
import { base64ToBlob, renderProcessedAudio } from '../utils/audio';
import { getProviderPreset, speakWithBrowserSynthesis } from '../utils/providers';
import { WaveformPlayer } from './WaveformPlayer';

interface SpeechStudioProps {
  voices: VoiceProfile[];
  selectedVoiceId: string;
  providerConfig: ProviderConfig;
  onSelectVoice: (id: string) => void;
  onUpdateVoice: (voice: VoiceProfile) => Promise<void>;
  onUpdateProviderConfig: (next: ProviderConfig) => void;
  onClipGenerated: (clip: GeneratedClip) => Promise<void>;
  onGoToVoiceLab: () => void;
  onOpenProviders: () => void;
  initialText?: string;
  onError: (msg: string) => void;
}

const EMOTIONS = [
  'Natural',
  'Warm & Intimate',
  'Authoritative',
  'Conversational',
  'Narrative',
  'Energetic',
  'Measured',
];

const VOCAL_CUES = [
  { label: '+ Breath', token: '<breath>' },
  { label: '+ Laugh', token: '<laugh>' },
  { label: '+ Gasp', token: '<gasp>' },
  { label: '+ Yeah', token: '|yeah|' },
  { label: '+ Mhm', token: '|mhm|' },
];

const SAMPLE_SCRIPTS = [
  {
    label: 'Documentary',
    text: 'Every city has a sound beneath the traffic—a quiet hum of steel rails, harbor ferries, and late-night conversations drifting from open windows.',
  },
  {
    label: 'Product Brief',
    text: 'Today we are introducing a faster way to master spoken audio directly in the browser. Record ten seconds, shape the tone, and export broadcast-ready sound.',
  },
  {
    label: 'Expressive Note',
    text: 'Wait—did you actually hear that? <breath> Honestly, I wasn’t expecting the room acoustics to sound this clean on the very first take! <laugh>',
  },
];

export const SpeechStudio: React.FC<SpeechStudioProps> = ({
  voices,
  selectedVoiceId,
  providerConfig,
  onSelectVoice,
  onUpdateVoice,
  onUpdateProviderConfig,
  onClipGenerated,
  onGoToVoiceLab,
  onOpenProviders,
  initialText,
  onError,
}) => {
  const activeVoice = voices.find((v) => v.id === selectedVoiceId) || voices[0];
  const [text, setText] = useState(
    initialText ||
      'Every great story begins with a voice that sounds unmistakably human. Type anything here to hear it spoken in your cloned timbre.'
  );
  const [emotion, setEmotion] = useState('Natural');
  const [isGenerating, setIsGenerating] = useState(false);

  const [rawAudioBlob, setRawAudioBlob] = useState<Blob | null>(null);
  const [processedClip, setProcessedClip] = useState<GeneratedClip | null>(null);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [dspDirtySinceRender, setDspDirtySinceRender] = useState(false);

  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedBrowserVoice, setSelectedBrowserVoice] = useState('');
  const [isBrowserSpeaking, setIsBrowserSpeaking] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cancelBrowserSpeechRef = useRef<(() => void) | null>(null);

  const activePreset = getProviderPreset(providerConfig.provider);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const load = () => {
      setBrowserVoices(window.speechSynthesis.getVoices());
    };
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', load);
    };
  }, []);

  useEffect(() => {
    return () => {
      cancelBrowserSpeechRef.current?.();
    };
  }, []);

  if (!activeVoice) {
    return (
      <div className="bg-[#12161F] border border-white/[0.08] rounded-xl p-10 text-center space-y-4">
        <p className="text-base font-medium text-[#E6EDF5]">No voices in your library yet</p>
        <p className="text-sm text-[#8D98A8]">
          Clone your first voice from a microphone recording or audio file to start synthesizing speech.
        </p>
        <button
          type="button"
          onClick={onGoToVoiceLab}
          className="px-4 py-2 text-sm font-medium text-white bg-[#4F7DF3] hover:bg-[#3E6BE0] rounded-lg transition-colors"
        >
          Clone New Voice
        </button>
      </div>
    );
  }

  const updateDsp = async (patch: Partial<VoiceDspSettings>) => {
    const nextVoice: VoiceProfile = {
      ...activeVoice,
      dsp: { ...activeVoice.dsp, ...patch },
    };
    await onUpdateVoice(nextVoice);
    if (rawAudioBlob) {
      setDspDirtySinceRender(true);
    }
  };

  const insertCue = (token: string) => {
    const el = textareaRef.current;
    if (!el) {
      setText((prev) => `${prev}${prev.endsWith(' ') || prev === '' ? '' : ' '}${token} `);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const before = text.slice(0, start);
    const after = text.slice(end);
    const padLeft = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n') ? ' ' : '';
    const padRight = after.length > 0 && !after.startsWith(' ') ? ' ' : '';
    const next = `${before}${padLeft}${token}${padRight}${after}`;
    setText(next);

    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + padLeft.length + token.length + padRight.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const handleGenerate = async () => {
    if (!text.trim()) {
      onError('Enter some text to synthesize.');
      return;
    }

    onError('');

    if (providerConfig.provider === 'browser') {
      if (isBrowserSpeaking) {
        cancelBrowserSpeechRef.current?.();
        setIsBrowserSpeaking(false);
        return;
      }
      const cleanSpeech = text.trim().replace(/<[^>]+>|\|[^|]+\|/g, '');
      cancelBrowserSpeechRef.current = speakWithBrowserSynthesis({
        text: cleanSpeech,
        voice: activeVoice,
        preferredBrowserVoiceName: selectedBrowserVoice || undefined,
        onStart: () => setIsBrowserSpeaking(true),
        onEnd: () => setIsBrowserSpeaking(false),
        onError: (msg) => {
          setIsBrowserSpeaking(false);
          onError(msg);
        },
      });
      return;
    }

    setIsGenerating(true);

    try {
      const res = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          baseVoice: activeVoice.baseVoice,
          stylePrompt: activeVoice.stylePrompt,
          emotion,
          model: providerConfig.ttsModel,
          externalVoiceId:
            activeVoice.externalProvider === providerConfig.provider
              ? activeVoice.externalVoiceId
              : undefined,
          providerConfig,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Speech synthesis failed.');
      }

      const rawAudio = base64ToBlob(data.audioBase64, data.mimeType || 'audio/wav');
      setRawAudioBlob(rawAudio);

      const rendered = await renderProcessedAudio(rawAudio, activeVoice.dsp);
      const clip: GeneratedClip = {
        id: `clip-${Date.now()}`,
        createdAt: Date.now(),
        mode: 'single',
        voiceId: activeVoice.id,
        voiceName: activeVoice.name,
        text: text.trim(),
        emotion,
        model: providerConfig.ttsModel,
        provider: providerConfig.provider,
        durationSec: rendered.durationSec,
        peaks: rendered.peaks,
        audioBlob: rendered.blob,
        appliedStyle: data.appliedStyle || activeVoice.stylePrompt,
      };

      setProcessedClip(clip);
      setDspDirtySinceRender(false);
      await onClipGenerated(clip);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to generate speech.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReapplyDsp = async () => {
    if (!rawAudioBlob || !processedClip) return;
    setIsReprocessing(true);
    try {
      const rendered = await renderProcessedAudio(rawAudioBlob, activeVoice.dsp);
      const updatedClip: GeneratedClip = {
        ...processedClip,
        durationSec: rendered.durationSec,
        peaks: rendered.peaks,
        audioBlob: rendered.blob,
      };
      setProcessedClip(updatedClip);
      setDspDirtySinceRender(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to apply DSP tuning.');
    } finally {
      setIsReprocessing(false);
    }
  };

  const estimatedSeconds = Math.max(
    1,
    Math.round((text.trim().split(/\s+/).filter(Boolean).length / 2.6) / activeVoice.dsp.speed)
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Panel: Voice Selection & Acoustic Tuning */}
      <aside className="lg:col-span-5 bg-[#12161F] border border-white/[0.08] rounded-xl p-6 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-[#E6EDF5]">Select Voice</h2>
          <button
            type="button"
            onClick={onGoToVoiceLab}
            className="text-xs font-medium text-[#4F7DF3] hover:text-[#6B93FA] transition-colors whitespace-nowrap"
          >
            + Clone voice
          </button>
        </div>

        <div className="divide-y divide-white/[0.06] max-h-52 overflow-y-auto pr-1">
          {voices.map((v) => {
            const active = v.id === activeVoice.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  onSelectVoice(v.id);
                  setDspDirtySinceRender(Boolean(rawAudioBlob));
                }}
                className={`w-full py-2.5 px-2.5 rounded-lg text-left transition-colors flex items-center justify-between gap-3 ${
                  active ? 'bg-[#4F7DF3]/15' : 'hover:bg-white/[0.04]'
                }`}
              >
                <div className="min-w-0">
                  <div className={`text-sm font-medium truncate ${active ? 'text-white' : 'text-[#E6EDF5]'}`}>
                    {v.name}
                  </div>
                  <div className="text-xs text-[#8D98A8] truncate mt-0.5">
                    {[
                      v.externalVoiceId ? 'ElevenLabs' : v.isPreset ? 'Blueprint' : 'Cloned',
                      v.pitchRegister,
                      v.acousticStats.pitchHz ? `${v.acousticStats.pitchHz} Hz` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                </div>
                {active && <Volume2 className="w-4 h-4 text-[#4F7DF3] shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        {activeVoice.referenceAudioBlob && (
          <div className="p-3.5 rounded-lg bg-[#0B0E14] border border-white/[0.06] space-y-2">
            <div className="text-xs font-medium text-[#8D98A8]">
              Original Sample ({activeVoice.name})
            </div>
            <WaveformPlayer
              audioBlob={activeVoice.referenceAudioBlob}
              peaks={activeVoice.acousticStats.peaks}
              durationSec={activeVoice.acousticStats.durationSec}
              compact
            />
          </div>
        )}

        {/* Engine, Provider & Delivery Controls */}
        <div className="pt-4 border-t border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-[#8D98A8] truncate">
              Provider: <span className="text-[#E6EDF5] font-medium">{activePreset.name}</span>
              {providerConfig.apiKey ? ' · Custom Key' : ''}
            </span>
            <button
              type="button"
              onClick={onOpenProviders}
              className="flex items-center gap-1 text-[#4F7DF3] hover:text-[#6B93FA] whitespace-nowrap shrink-0"
            >
              <KeyRound className="w-3 h-3" />
              <span>Providers &amp; Keys</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="emotion-select" className="block text-xs font-medium text-[#8D98A8] mb-1.5">
                Delivery Mood
              </label>
              <select
                id="emotion-select"
                value={emotion}
                onChange={(e) => setEmotion(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#0B0E14] border border-white/[0.1] rounded-lg text-[#E6EDF5] focus:outline-none focus:border-[#4F7DF3]"
              >
                {EMOTIONS.map((em) => (
                  <option key={em} value={em}>
                    {em}
                  </option>
                ))}
              </select>
            </div>

            {providerConfig.provider === 'browser' ? (
              <div>
                <label htmlFor="browser-voice-select" className="block text-xs font-medium text-[#8D98A8] mb-1.5">
                  System Speech Voice
                </label>
                <select
                  id="browser-voice-select"
                  value={selectedBrowserVoice}
                  onChange={(e) => setSelectedBrowserVoice(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[#0B0E14] border border-white/[0.1] rounded-lg text-[#E6EDF5] focus:outline-none focus:border-[#4F7DF3]"
                >
                  <option value="">Auto-match Cloned Pitch</option>
                  {browserVoices.map((bv) => (
                    <option key={bv.name} value={bv.name}>
                      {bv.name} ({bv.lang})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor="studio-tts-model" className="block text-xs font-medium text-[#8D98A8] mb-1.5">
                  Model ID (Editable)
                </label>
                <input
                  id="studio-tts-model"
                  type="text"
                  value={providerConfig.ttsModel}
                  onChange={(e) =>
                    onUpdateProviderConfig({
                      ...providerConfig,
                      ttsModel: e.target.value,
                    })
                  }
                  placeholder={activePreset.defaultTtsModel}
                  className="w-full px-3 py-2 text-xs font-mono bg-[#0B0E14] border border-white/[0.1] rounded-lg text-[#E6EDF5] focus:outline-none focus:border-[#4F7DF3]"
                />
              </div>
            )}
          </div>

          {providerConfig.provider === 'gemini' && (
            <div className="flex flex-wrap gap-1.5">
              {activePreset.suggestedTtsModels.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onUpdateProviderConfig({ ...providerConfig, ttsModel: m })}
                  className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors ${
                    providerConfig.ttsModel === m
                      ? 'bg-[#4F7DF3]/20 border-[#4F7DF3]/40 text-white'
                      : 'bg-[#0B0E14] border-white/[0.08] text-[#8D98A8] hover:text-[#E6EDF5]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          {/* DSP Mastering Sliders */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#8D98A8] flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5" />
                <span>Acoustic Mastering</span>
              </span>
              <button
                type="button"
                onClick={() => updateDsp({ pitchSemitones: 0, speed: 1, warmthDb: 0, presenceDb: 0 })}
                className="flex items-center gap-1 text-xs text-[#8D98A8] hover:text-[#E6EDF5] transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#8D98A8]">Pitch Shift</span>
                  <span className="font-mono tabular-nums text-[#E6EDF5]">
                    {activeVoice.dsp.pitchSemitones > 0 ? '+' : ''}
                    {activeVoice.dsp.pitchSemitones.toFixed(1)} st
                  </span>
                </div>
                <input
                  type="range"
                  min={-6}
                  max={6}
                  step={0.5}
                  value={activeVoice.dsp.pitchSemitones}
                  onChange={(e) => updateDsp({ pitchSemitones: Number(e.target.value) })}
                  className="w-full studio-slider"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#8D98A8]">Speaking Pace</span>
                  <span className="font-mono tabular-nums text-[#E6EDF5]">
                    {activeVoice.dsp.speed.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.75}
                  max={1.35}
                  step={0.05}
                  value={activeVoice.dsp.speed}
                  onChange={(e) => updateDsp({ speed: Number(e.target.value) })}
                  className="w-full studio-slider"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#8D98A8]">Body Warmth</span>
                  <span className="font-mono tabular-nums text-[#E6EDF5]">
                    {activeVoice.dsp.warmthDb > 0 ? '+' : ''}
                    {activeVoice.dsp.warmthDb} dB
                  </span>
                </div>
                <input
                  type="range"
                  min={-6}
                  max={6}
                  step={1}
                  value={activeVoice.dsp.warmthDb}
                  onChange={(e) => updateDsp({ warmthDb: Number(e.target.value) })}
                  className="w-full studio-slider"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#8D98A8]">Air Presence</span>
                  <span className="font-mono tabular-nums text-[#E6EDF5]">
                    {activeVoice.dsp.presenceDb > 0 ? '+' : ''}
                    {activeVoice.dsp.presenceDb} dB
                  </span>
                </div>
                <input
                  type="range"
                  min={-6}
                  max={6}
                  step={1}
                  value={activeVoice.dsp.presenceDb}
                  onChange={(e) => updateDsp({ presenceDb: Number(e.target.value) })}
                  className="w-full studio-slider"
                />
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="studio-style-prompt" className="block text-xs font-medium text-[#8D98A8] mb-1.5">
              Voice Style Blueprint
            </label>
            <textarea
              id="studio-style-prompt"
              rows={2}
              value={activeVoice.stylePrompt}
              onChange={(e) =>
                onUpdateVoice({
                  ...activeVoice,
                  stylePrompt: e.target.value,
                })
              }
              className="w-full px-3 py-2 text-xs leading-relaxed bg-[#0B0E14] border border-white/[0.1] rounded-lg text-[#E6EDF5] focus:outline-none focus:border-[#4F7DF3]"
            />
          </div>
        </div>
      </aside>

      {/* Right Panel: Script Editor & Master Output */}
      <section className="lg:col-span-7 space-y-6">
        <div className="bg-[#12161F] border border-white/[0.08] rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-[#E6EDF5] tracking-tight">
                Text-to-Speech Studio
              </h1>
              <p className="text-xs text-[#8D98A8] mt-0.5">
                Speaking as <span className="text-[#E6EDF5] font-medium">{activeVoice.name}</span> · {activeVoice.pitchRegister}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              {SAMPLE_SCRIPTS.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => setText(sample.text)}
                  className="px-2.5 py-1.5 text-xs text-[#8D98A8] hover:text-[#E6EDF5] bg-[#0B0E14] border border-white/[0.06] hover:border-white/[0.15] rounded-md transition-colors whitespace-nowrap"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            ref={textareaRef}
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={5000}
            placeholder="Enter the script you want your cloned voice to speak..."
            className="w-full p-4 text-base leading-relaxed bg-[#0B0E14] border border-white/[0.08] rounded-lg text-[#E6EDF5] placeholder:text-[#647082] focus:outline-none focus:border-[#4F7DF3] resize-y"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {providerConfig.provider === 'gemini' && (
                <>
                  {VOCAL_CUES.map((cue) => (
                    <button
                      key={cue.token}
                      type="button"
                      onClick={() => insertCue(cue.token)}
                      className="px-2.5 py-1 text-xs font-mono text-[#8D98A8] hover:text-[#E6EDF5] bg-white/[0.04] hover:bg-white/[0.08] rounded-md transition-colors whitespace-nowrap"
                    >
                      {cue.label}
                    </button>
                  ))}
                </>
              )}
            </div>

            <div className="flex items-center gap-4 ml-auto">
              <span className="font-mono text-xs tabular-nums text-[#8D98A8]">
                {text.length} / 5000 · ~{estimatedSeconds}s
              </span>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || text.trim().length === 0}
                className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0 ${
                  isBrowserSpeaking
                    ? 'bg-[#DC2626] hover:bg-[#B91C1C]'
                    : 'bg-[#4F7DF3] hover:bg-[#3E6BE0]'
                }`}
              >
                {isBrowserSpeaking ? (
                  <>
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop Browser Speech</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>
                      {isGenerating
                        ? 'Synthesizing...'
                        : providerConfig.provider === 'browser'
                        ? 'Speak in Browser'
                        : 'Generate Speech'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Master Audio Deck */}
        <div className="bg-[#12161F] border border-white/[0.08] rounded-xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[#E6EDF5]">Master Output</h2>

            {dspDirtySinceRender && rawAudioBlob && (
              <button
                type="button"
                onClick={handleReapplyDsp}
                disabled={isReprocessing}
                className="px-3 py-1.5 text-xs font-medium text-[#4F7DF3] bg-[#4F7DF3]/10 hover:bg-[#4F7DF3]/20 border border-[#4F7DF3]/30 rounded-lg transition-colors whitespace-nowrap"
              >
                {isReprocessing ? 'Rendering DSP...' : 'Apply Updated Acoustic Tuning'}
              </button>
            )}
          </div>

          {providerConfig.provider === 'browser' ? (
            <div className="p-6 rounded-lg bg-[#0B0E14] border border-white/[0.06] text-center space-y-2">
              <p className="text-sm text-[#E6EDF5]">
                {isBrowserSpeaking
                  ? `Speaking live via Browser Web Speech API (${activeVoice.name} pitch & pace)...`
                  : 'Browser Native Speech plays directly through your audio output with zero API key or rate limits.'}
              </p>
              <p className="text-xs text-[#8D98A8]">
                Switch to Gemini, Groq, Hugging Face, or ElevenLabs in Providers to export downloadable WAV files.
              </p>
            </div>
          ) : processedClip ? (
            <div className="p-4 rounded-lg bg-[#0B0E14] border border-white/[0.06]">
              <WaveformPlayer
                audioBlob={processedClip.audioBlob}
                peaks={processedClip.peaks}
                durationSec={processedClip.durationSec}
                title={`${processedClip.voiceName} · ${processedClip.emotion}`}
                subtitle={`${processedClip.model} · ${processedClip.text.slice(0, 64)}${
                  processedClip.text.length > 64 ? '…' : ''
                }`}
                downloadFilename={`${processedClip.voiceName.toLowerCase().replace(/\s+/g, '-')}-speech.wav`}
              />
            </div>
          ) : (
            <div className="p-8 rounded-lg bg-[#0B0E14] border border-white/[0.06] text-center">
              <p className="text-sm text-[#8D98A8]">
                {isGenerating
                  ? `Synthesizing speech via ${activePreset.name} (${providerConfig.ttsModel})...`
                  : 'Your synthesized audio waveform and WAV download will appear here.'}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
