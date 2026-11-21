import React, { useEffect, useRef, useState } from 'react';
import { Mic, Square, Upload, Sparkles, ArrowRight, Trash2, RotateCcw, Sliders } from 'lucide-react';
import { AcousticStats, BaseVoiceName, ProviderConfig, VoiceProfile } from '../types/voice';
import {
  analyzeAudioBlob,
  blobToBase64,
  convertBlobToWav,
  formatDuration,
} from '../utils/audio';
import { getProviderPreset } from '../utils/providers';
import { LiveMicVisualizer } from './LiveMicVisualizer';
import { WaveformPlayer } from './WaveformPlayer';

interface VoiceLabProps {
  voices: VoiceProfile[];
  selectedVoiceId: string;
  providerConfig: ProviderConfig;
  onVoiceCreated: (voice: VoiceProfile) => Promise<void>;
  onVoiceUpdated: (voice: VoiceProfile) => Promise<void>;
  onVoiceDeleted: (id: string) => Promise<void>;
  onUseInStudio: (voiceId: string) => void;
  onOpenProviders: () => void;
  onError: (msg: string) => void;
}

const SAMPLE_PROMPTS = [
  'The light across the harbor shifts every twenty minutes, turning the steel bridges from silver to deep slate before dusk settles over the water.',
  'When you build an instrument meant to last decades, every tolerance matters—from the weight of the dial to the quiet click of the housing.',
  'Honestly, the best part of the morning isn’t the espresso itself; it’s those ten quiet minutes before the city wakes up and the phones start ringing.',
];

const BASE_VOICES: BaseVoiceName[] = ['Charon', 'Fenrir', 'Puck', 'Kore', 'Zephyr'];

function buildLocalDspProfile(stats: AcousticStats, customName: string): Omit<VoiceProfile, 'id' | 'createdAt' | 'referenceAudioBlob' | 'referenceMimeType'> {
  const pitch = stats.pitchHz || 150;
  let baseVoice: BaseVoiceName = 'Kore';
  let pitchRegister = 'Balanced Mid-Range';
  let timbreTraits = ['Natural', 'Clear', 'Balanced'];

  if (pitch < 125) {
    baseVoice = 'Charon';
    pitchRegister = 'Deep Baritone';
    timbreTraits = ['Grounded', 'Resonant', 'Warm', 'Close-mic'];
  } else if (pitch < 155) {
    baseVoice = 'Fenrir';
    pitchRegister = 'Warm Low-Mid';
    timbreTraits = ['Textured', 'Rich', 'Steady'];
  } else if (pitch < 185) {
    baseVoice = (stats.spectralCentroidHz || 0) > 2100 ? 'Puck' : 'Kore';
    pitchRegister = (stats.spectralCentroidHz || 0) > 2100 ? 'Agile Tenor' : 'Warm Alto';
    timbreTraits = ['Expressive', 'Articulate', 'Crisp'];
  } else if (pitch < 220) {
    baseVoice = 'Kore';
    pitchRegister = 'Clear Alto';
    timbreTraits = ['Poised', 'Clear', 'Warm'];
  } else {
    baseVoice = 'Zephyr';
    pitchRegister = 'Bright Soprano';
    timbreTraits = ['Airy', 'Bright', 'Expressive'];
  }

  return {
    name: customName || `${pitchRegister} Clone`,
    isPreset: false,
    baseVoice,
    pitchRegister,
    timbreTraits,
    cadence: 'Measured conversational pacing extracted from waveform envelope',
    accentAndArticulation: 'Clear, natural articulation',
    emotionalBaseline: 'Grounded and expressive',
    stylePrompt: `Speak in a ${pitchRegister.toLowerCase()} register with ${timbreTraits.join(', ').toLowerCase()} qualities.`,
    transcript: '',
    acousticStats: stats,
    dsp: { pitchSemitones: 0, speed: 1, warmthDb: 0, presenceDb: 0 },
  };
}

export const VoiceLab: React.FC<VoiceLabProps> = ({
  voices,
  selectedVoiceId,
  providerConfig,
  onVoiceCreated,
  onVoiceUpdated,
  onVoiceDeleted,
  onUseInStudio,
  onOpenProviders,
  onError,
}) => {
  const [captureMode, setCaptureMode] = useState<'record' | 'upload'>('record');
  const [promptIndex, setPromptIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const [sampleBlob, setSampleBlob] = useState<Blob | null>(null);
  const [sampleFilename, setSampleFilename] = useState<string>('');
  const [sampleStats, setSampleStats] = useState<AcousticStats | null>(null);
  const [isDecodingSample, setIsDecodingSample] = useState(false);

  const [voiceName, setVoiceName] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState('');

  const [inspectedId, setInspectedId] = useState<string>(selectedVoiceId);
  const [isDragOver, setIsDragOver] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const inspectedVoice = voices.find((v) => v.id === inspectedId) || voices[0] || null;
  const activePreset = getProviderPreset(providerConfig.provider);

  useEffect(() => {
    setInspectedId(selectedVoiceId);
  }, [selectedVoiceId]);

  useEffect(() => {
    return () => {
      cleanupRecording();
    };
  }, []);

  const cleanupRecording = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setAnalyser(null);
  };

  const processCapturedBlob = async (rawBlob: Blob, label: string) => {
    setIsDecodingSample(true);
    onError('');
    try {
      let cleanBlob = rawBlob;
      if (!rawBlob.type.includes('wav') && !rawBlob.type.includes('mp3') && !rawBlob.type.includes('mpeg')) {
        try {
          cleanBlob = await convertBlobToWav(rawBlob);
        } catch {
          cleanBlob = rawBlob;
        }
      }

      const stats = await analyzeAudioBlob(cleanBlob);
      if (stats.durationSec < 1.2) {
        onError('Audio sample is too short. Please provide at least 2 seconds of clear speech.');
        return;
      }

      setSampleBlob(cleanBlob);
      setSampleFilename(label);
      setSampleStats(stats);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to decode this audio file. Try WAV, MP3, or WebM.');
    } finally {
      setIsDecodingSample(false);
    }
  };

  const startRecording = async () => {
    onError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 256;
      source.connect(analyserNode);
      setAnalyser(analyserNode);

      const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'];
      const supportedMime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m));
      const recorder = supportedMime ? new MediaRecorder(stream, { mimeType: supportedMime }) : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const recordedBlob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        cleanupRecording();
        setIsRecording(false);
        await processCapturedBlob(recordedBlob, 'Microphone Recording');
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      setSampleBlob(null);
      setSampleStats(null);

      timerRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 59) {
            stopRecording();
            return 60;
          }
          return prev + 1;
        });
      }, 1000);
    } catch {
      cleanupRecording();
      setIsRecording(false);
      onError('Microphone access was denied or unavailable. Check browser permissions or upload an audio file.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      onError('Audio file exceeds 20 MB limit. Please upload a shorter sample (5–30 seconds works best).');
      return;
    }
    await processCapturedBlob(file, file.name);
  };

  const handleCloneVoice = async () => {
    if (!sampleBlob || !sampleStats) return;
    onError('');
    setIsAnalyzing(true);

    try {
      if (providerConfig.provider === 'browser') {
        setAnalysisStep('Building local Web Audio DSP acoustic voice profile...');
        const localProfile = buildLocalDspProfile(sampleStats, voiceName.trim());
        const newVoice: VoiceProfile = {
          ...localProfile,
          id: `voice-${Date.now()}`,
          createdAt: Date.now(),
          referenceAudioBlob: sampleBlob,
          referenceMimeType: sampleBlob.type || 'audio/wav',
        };
        await onVoiceCreated(newVoice);
        setInspectedId(newVoice.id);
        setVoiceName('');
        setSampleBlob(null);
        setSampleStats(null);
        setSampleFilename('');
        return;
      }

      setAnalysisStep(`Profiling via ${activePreset.name} (${providerConfig.analysisModel})...`);
      const audioBase64 = await blobToBase64(sampleBlob);

      const res = await fetch('/api/voices/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioBase64,
          mimeType: sampleBlob.type || 'audio/wav',
          customName: voiceName.trim() || undefined,
          acousticStats: {
            durationSec: sampleStats.durationSec,
            pitchHz: sampleStats.pitchHz,
            spectralCentroidHz: sampleStats.spectralCentroidHz,
            dynamicRangeDb: sampleStats.dynamicRangeDb,
          },
          providerConfig,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Voice analysis failed.');
      }

      const newVoice: VoiceProfile = {
        id: `voice-${Date.now()}`,
        name: data.profile.name,
        isPreset: false,
        createdAt: Date.now(),
        baseVoice: data.profile.baseVoice,
        pitchRegister: data.profile.pitchRegister,
        timbreTraits: data.profile.timbreTraits,
        cadence: data.profile.cadence,
        accentAndArticulation: data.profile.accentAndArticulation,
        emotionalBaseline: data.profile.emotionalBaseline,
        stylePrompt: data.profile.stylePrompt,
        transcript: data.transcript || '',
        acousticStats: sampleStats,
        dsp: {
          pitchSemitones: data.profile.recommendedPitchShiftSemitones ?? 0,
          speed: data.profile.recommendedSpeed ?? 1,
          warmthDb: 0,
          presenceDb: 0,
        },
        referenceAudioBlob: sampleBlob,
        referenceMimeType: sampleBlob.type || 'audio/wav',
        externalProvider: data.profile.externalProvider,
        externalVoiceId: data.profile.externalVoiceId,
      };

      await onVoiceCreated(newVoice);
      setInspectedId(newVoice.id);
      setVoiceName('');
      setSampleBlob(null);
      setSampleStats(null);
      setSampleFilename('');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to clone voice.');
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep('');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Capture & Clone Pipeline */}
      <section className="lg:col-span-6 bg-[#12161F] border border-white/[0.08] rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-[#E6EDF5] tracking-tight text-balance">
              Clone a Voice
            </h1>
            <p className="text-xs text-[#8D98A8] mt-1">
              Profiler: <span className="text-[#E6EDF5]">{activePreset.name}</span> ·{' '}
              <span className="font-mono">{providerConfig.analysisModel}</span>{' '}
              <button
                type="button"
                onClick={onOpenProviders}
                className="text-[#4F7DF3] hover:text-[#6B93FA] ml-1"
              >
                Change
              </button>
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#0B0E14] border border-white/[0.06] rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setCaptureMode('record')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                captureMode === 'record'
                  ? 'bg-[#1D2432] text-white'
                  : 'text-[#8D98A8] hover:text-[#E6EDF5]'
              }`}
            >
              Microphone
            </button>
            <button
              type="button"
              onClick={() => setCaptureMode('upload')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                captureMode === 'upload'
                  ? 'bg-[#1D2432] text-white'
                  : 'text-[#8D98A8] hover:text-[#E6EDF5]'
              }`}
            >
              Upload Audio
            </button>
          </div>
        </div>

        {captureMode === 'record' ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-[#0B0E14] border border-white/[0.06] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-[#8D98A8]">Suggested reading prompt</span>
                <button
                  type="button"
                  onClick={() => setPromptIndex((i) => (i + 1) % SAMPLE_PROMPTS.length)}
                  className="text-xs text-[#4F7DF3] hover:text-[#6B93FA] transition-colors whitespace-nowrap"
                >
                  Next prompt
                </button>
              </div>
              <p className="text-sm text-[#E6EDF5]/90 leading-relaxed">
                “{SAMPLE_PROMPTS[promptIndex]}”
              </p>
            </div>

            <LiveMicVisualizer analyser={analyser} isRecording={isRecording} />

            <div className="flex items-center justify-between gap-4">
              {!isRecording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={isAnalyzing}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#4F7DF3] hover:bg-[#3E6BE0] rounded-lg transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  <Mic className="w-4 h-4" />
                  <span>{sampleBlob ? 'Record Again' : 'Start Recording'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#DC2626] hover:bg-[#B91C1C] rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop Recording</span>
                </button>
              )}

              <div className="flex items-center gap-2 font-mono text-sm tabular-nums text-[#E6EDF5]">
                {isRecording && (
                  <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" aria-hidden="true" />
                )}
                <span>{formatDuration(recordingSeconds)}</span>
                <span className="text-[#8D98A8]">/ 1:00</span>
              </div>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              handleFileSelected(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`flex flex-col items-center justify-center p-8 rounded-lg border border-dashed cursor-pointer transition-colors ${
              isDragOver
                ? 'border-[#4F7DF3] bg-[#4F7DF3]/10'
                : 'border-white/[0.15] bg-[#0B0E14] hover:border-white/[0.28]'
            }`}
          >
            <Upload className="w-6 h-6 text-[#8D98A8] mb-3" />
            <p className="text-sm font-medium text-[#E6EDF5]">
              Drop an audio sample here, or click to browse
            </p>
            <p className="text-xs text-[#8D98A8] mt-1">
              Supports WAV, MP3, WebM, M4A, OGG, FLAC up to 20 MB
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={(e) => handleFileSelected(e.target.files?.[0])}
              className="hidden"
            />
          </div>
        )}

        {isDecodingSample && (
          <div className="py-4 text-sm text-[#8D98A8]">
            Decoding waveform &amp; measuring acoustic signature...
          </div>
        )}

        {sampleBlob && sampleStats && !isDecodingSample && (
          <div className="pt-4 border-t border-white/[0.08] space-y-5">
            <WaveformPlayer
              audioBlob={sampleBlob}
              peaks={sampleStats.peaks}
              durationSec={sampleStats.durationSec}
              title={sampleFilename || 'Reference Voice Sample'}
              subtitle={[
                `${sampleStats.durationSec.toFixed(1)} s`,
                sampleStats.pitchHz ? `${sampleStats.pitchHz} Hz fundamental` : null,
                sampleStats.spectralCentroidHz ? `${sampleStats.spectralCentroidHz} Hz brightness` : null,
                `${sampleStats.dynamicRangeDb} dB range`,
              ]
                .filter(Boolean)
                .join(' · ')}
            />

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-7">
                <label htmlFor="voice-name-input" className="block text-xs font-medium text-[#8D98A8] mb-1.5">
                  Voice Name (optional)
                </label>
                <input
                  id="voice-name-input"
                  type="text"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="e.g., Studio Narrator or My Voice"
                  maxLength={48}
                  className="w-full px-3.5 py-2.5 text-sm bg-[#0B0E14] border border-white/[0.1] rounded-lg text-[#E6EDF5] placeholder:text-[#647082] focus:outline-none focus:border-[#4F7DF3]"
                />
              </div>

              <div className="sm:col-span-5">
                <button
                  type="button"
                  onClick={handleCloneVoice}
                  disabled={isAnalyzing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#4F7DF3] hover:bg-[#3E6BE0] rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isAnalyzing ? 'Cloning...' : 'Clone Voice'}</span>
                </button>
              </div>
            </div>

            {isAnalyzing && analysisStep && (
              <p className="text-xs text-[#4F7DF3]">{analysisStep}</p>
            )}
          </div>
        )}
      </section>

      {/* Right: Saved Voice Library & Acoustic Inspector */}
      <section className="lg:col-span-6 space-y-6">
        <div className="bg-[#12161F] border border-white/[0.08] rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-base font-semibold text-[#E6EDF5]">
              Voice Library
            </h2>
            <span className="font-mono text-xs tabular-nums text-[#8D98A8]">
              {voices.length} {voices.length === 1 ? 'voice' : 'voices'}
            </span>
          </div>

          <div className="divide-y divide-white/[0.06] max-h-64 overflow-y-auto pr-1">
            {voices.map((v) => {
              const isSelected = v.id === inspectedVoice?.id;
              return (
                <div
                  key={v.id}
                  className={`py-3 flex items-center justify-between gap-4 transition-colors ${
                    isSelected ? 'opacity-100' : 'opacity-80 hover:opacity-100'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setInspectedId(v.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium truncate ${
                          isSelected ? 'text-[#4F7DF3]' : 'text-[#E6EDF5]'
                        }`}
                      >
                        {v.name}
                      </span>
                    </div>
                    <p className="text-xs text-[#8D98A8] truncate mt-0.5">
                      {[
                        v.externalVoiceId
                          ? 'ElevenLabs Clone'
                          : v.isPreset
                          ? 'Starter Blueprint'
                          : 'Cloned Voice',
                        v.pitchRegister,
                        v.acousticStats.pitchHz ? `${v.acousticStats.pitchHz} Hz` : null,
                        v.baseVoice,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onUseInStudio(v.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#E6EDF5] bg-white/[0.06] hover:bg-white/[0.12] rounded-md transition-colors whitespace-nowrap"
                    >
                      <span>Use</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    {voices.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onVoiceDeleted(v.id)}
                        aria-label={`Delete ${v.name}`}
                        className="p-1.5 text-[#8D98A8] hover:text-[#EF4444] transition-colors rounded-md"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {inspectedVoice && (
          <div className="bg-[#12161F] border border-white/[0.08] rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-[#E6EDF5]">{inspectedVoice.name}</h2>
                <p className="text-xs text-[#8D98A8] mt-1">
                  {inspectedVoice.pitchRegister} · {inspectedVoice.timbreTraits.join(' · ')}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onUseInStudio(inspectedVoice.id)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-[#4F7DF3] hover:bg-[#3E6BE0] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <span>Open in Speech Studio</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {inspectedVoice.referenceAudioBlob && (
              <div className="p-3.5 rounded-lg bg-[#0B0E14] border border-white/[0.06]">
                <WaveformPlayer
                  audioBlob={inspectedVoice.referenceAudioBlob}
                  peaks={inspectedVoice.acousticStats.peaks}
                  durationSec={inspectedVoice.acousticStats.durationSec}
                  title="Original Reference Recording"
                  compact
                />
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-3 border-y border-white/[0.06]">
              <div>
                <div className="text-xs text-[#8D98A8]">Fundamental</div>
                <div className="font-mono text-sm font-medium tabular-nums text-[#E6EDF5] mt-0.5">
                  {inspectedVoice.acousticStats.pitchHz ? `${inspectedVoice.acousticStats.pitchHz} Hz` : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#8D98A8]">Brightness</div>
                <div className="font-mono text-sm font-medium tabular-nums text-[#E6EDF5] mt-0.5">
                  {inspectedVoice.acousticStats.spectralCentroidHz
                    ? `${inspectedVoice.acousticStats.spectralCentroidHz} Hz`
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#8D98A8]">Dynamic Range</div>
                <div className="font-mono text-sm font-medium tabular-nums text-[#E6EDF5] mt-0.5">
                  {inspectedVoice.acousticStats.dynamicRangeDb.toFixed(1)} dB
                </div>
              </div>
              <div>
                <div className="text-xs text-[#8D98A8]">Base Timbre</div>
                <select
                  aria-label="Base timbre model"
                  value={inspectedVoice.baseVoice}
                  onChange={(e) =>
                    onVoiceUpdated({
                      ...inspectedVoice,
                      baseVoice: e.target.value as BaseVoiceName,
                    })
                  }
                  className="mt-0.5 bg-[#0B0E14] border border-white/[0.1] rounded px-2 py-0.5 text-xs font-mono text-[#E6EDF5] focus:outline-none focus:border-[#4F7DF3]"
                >
                  {BASE_VOICES.map((bv) => (
                    <option key={bv} value={bv}>
                      {bv}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {inspectedVoice.transcript && !inspectedVoice.isPreset && (
              <div>
                <div className="text-xs font-medium text-[#8D98A8] mb-1">Captured Transcript</div>
                <p className="text-xs text-[#E6EDF5]/80 leading-relaxed">
                  “{inspectedVoice.transcript}”
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-[#8D98A8] mb-0.5">Cadence &amp; Rhythm</div>
                <p className="text-[#E6EDF5]/90 leading-relaxed">{inspectedVoice.cadence}</p>
              </div>
              <div>
                <div className="text-[#8D98A8] mb-0.5">Accent &amp; Articulation</div>
                <p className="text-[#E6EDF5]/90 leading-relaxed">{inspectedVoice.accentAndArticulation}</p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="profile-style-prompt" className="text-xs font-medium text-[#8D98A8]">
                  Voice Style Directive
                </label>
                <span className="text-xs text-[#8D98A8] flex items-center gap-1">
                  <Sliders className="w-3 h-3" />
                  <span>Editable</span>
                </span>
              </div>
              <textarea
                id="profile-style-prompt"
                rows={3}
                value={inspectedVoice.stylePrompt}
                onChange={(e) =>
                  onVoiceUpdated({
                    ...inspectedVoice,
                    stylePrompt: e.target.value,
                  })
                }
                className="w-full px-3 py-2 text-xs leading-relaxed bg-[#0B0E14] border border-white/[0.1] rounded-lg text-[#E6EDF5] focus:outline-none focus:border-[#4F7DF3]"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs">
              <span className="text-[#8D98A8]">
                Auto-tuned pitch offset:{' '}
                <span className="font-mono tabular-nums text-[#E6EDF5]">
                  {inspectedVoice.dsp.pitchSemitones > 0 ? '+' : ''}
                  {inspectedVoice.dsp.pitchSemitones.toFixed(1)} st
                </span>
                {' · '}
                <span className="font-mono tabular-nums text-[#E6EDF5]">
                  {inspectedVoice.dsp.speed.toFixed(2)}x
                </span>
              </span>
              <button
                type="button"
                onClick={() =>
                  onVoiceUpdated({
                    ...inspectedVoice,
                    dsp: { pitchSemitones: 0, speed: 1, warmthDb: 0, presenceDb: 0 },
                  })
                }
                className="flex items-center gap-1 text-[#8D98A8] hover:text-[#E6EDF5] transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset DSP</span>
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
