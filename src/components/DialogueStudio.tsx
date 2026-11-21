import React, { useState } from 'react';
import { Play, Plus, Trash2 } from 'lucide-react';
import { DialogueTurn, GeneratedClip, ProviderConfig, VoiceProfile } from '../types/voice';
import { analyzeAudioBlob, base64ToBlob } from '../utils/audio';
import { WaveformPlayer } from './WaveformPlayer';

interface DialogueStudioProps {
  voices: VoiceProfile[];
  providerConfig: ProviderConfig;
  onClipGenerated: (clip: GeneratedClip) => Promise<void>;
  onOpenProviders: () => void;
  onError: (msg: string) => void;
}

export const DialogueStudio: React.FC<DialogueStudioProps> = ({
  voices,
  providerConfig,
  onClipGenerated,
  onOpenProviders,
  onError,
}) => {
  const [speakerAId, setSpeakerAId] = useState(voices[0]?.id || '');
  const [speakerBId, setSpeakerBId] = useState(voices[1]?.id || voices[0]?.id || '');
  const [turns, setTurns] = useState<DialogueTurn[]>([
    {
      id: 't-1',
      speakerSlot: 'A',
      text: 'Welcome back to the studio. <breath> Today we are testing two distinct voices in a live conversation.',
    },
    {
      id: 't-2',
      speakerSlot: 'B',
      text: '|yeah| And the best part is you can swap in any voice you cloned from a ten-second recording. <laugh>',
    },
  ]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedClip, setGeneratedClip] = useState<GeneratedClip | null>(null);

  const voiceA = voices.find((v) => v.id === speakerAId) || voices[0];
  const voiceB = voices.find((v) => v.id === speakerBId) || voices[1] || voices[0];

  const addTurn = () => {
    const lastSlot = turns[turns.length - 1]?.speakerSlot || 'B';
    setTurns((prev) => [
      ...prev,
      {
        id: `t-${Date.now()}`,
        speakerSlot: lastSlot === 'A' ? 'B' : 'A',
        text: '',
      },
    ]);
  };

  const updateTurn = (id: string, patch: Partial<DialogueTurn>) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const removeTurn = (id: string) => {
    if (turns.length <= 1) return;
    setTurns((prev) => prev.filter((t) => t.id !== id));
  };

  const handleSynthesizeDialogue = async () => {
    if (!voiceA || !voiceB) {
      onError('At least one voice is required to synthesize dialogue.');
      return;
    }

    const nonEmptyTurns = turns.filter((t) => t.text.trim().length > 0);
    if (nonEmptyTurns.length === 0) {
      onError('Add dialogue text for at least one line.');
      return;
    }

    onError('');
    setIsGenerating(true);

    try {
      const effectiveProviderConfig =
        providerConfig.provider === 'gemini'
          ? providerConfig
          : { ...providerConfig, provider: 'gemini' as const, apiKey: '', ttsModel: 'gemini-2.5-flash-preview-tts' };

      const res = await fetch('/api/tts/dialogue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          speakerA: {
            name: voiceA.name,
            baseVoice: voiceA.baseVoice,
            stylePrompt: voiceA.stylePrompt,
          },
          speakerB: {
            name: voiceB.name,
            baseVoice: voiceB.baseVoice,
            stylePrompt: voiceB.stylePrompt,
          },
          lines: nonEmptyTurns.map((t) => ({
            speakerSlot: t.speakerSlot,
            text: t.text.trim(),
          })),
          providerConfig: effectiveProviderConfig,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Dialogue synthesis failed.');
      }

      const wavBlob = base64ToBlob(data.audioBase64, data.mimeType || 'audio/wav');
      const stats = await analyzeAudioBlob(wavBlob);

      const combinedScript = nonEmptyTurns
        .map((t) => `${t.speakerSlot === 'A' ? voiceA.name : voiceB.name}: ${t.text.trim()}`)
        .join('\n');

      const clip: GeneratedClip = {
        id: `clip-${Date.now()}`,
        createdAt: Date.now(),
        mode: 'dialogue',
        voiceId: voiceA.id,
        voiceName: voiceA.name,
        secondaryVoiceId: voiceB.id,
        secondaryVoiceName: voiceB.name,
        text: combinedScript,
        emotion: 'Dialogue',
        model: effectiveProviderConfig.ttsModel,
        provider: 'gemini',
        durationSec: stats.durationSec,
        peaks: stats.peaks,
        audioBlob: wavBlob,
        appliedStyle: data.appliedStyle || `${voiceA.name} & ${voiceB.name}`,
      };

      setGeneratedClip(clip);
      await onClipGenerated(clip);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Unable to generate dialogue.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Cast Assignment */}
      <aside className="lg:col-span-4 bg-[#12161F] border border-white/[0.08] rounded-xl p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-[#E6EDF5]">Cast Voices</h2>
          <p className="text-xs text-[#8D98A8] mt-1">
            Assign any two cloned or starter voices to Speaker A and Speaker B.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="speaker-a-select" className="block text-xs font-medium text-[#8D98A8] mb-1.5">
              Speaker A
            </label>
            <select
              id="speaker-a-select"
              value={voiceA?.id || ''}
              onChange={(e) => setSpeakerAId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-[#0B0E14] border border-white/[0.1] rounded-lg text-[#E6EDF5] focus:outline-none focus:border-[#4F7DF3]"
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.pitchRegister})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="speaker-b-select" className="block text-xs font-medium text-[#8D98A8] mb-1.5">
              Speaker B
            </label>
            <select
              id="speaker-b-select"
              value={voiceB?.id || ''}
              onChange={(e) => setSpeakerBId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-[#0B0E14] border border-white/[0.1] rounded-lg text-[#E6EDF5] focus:outline-none focus:border-[#4F7DF3]"
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.pitchRegister})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="pt-4 border-t border-white/[0.06] text-xs text-[#8D98A8] space-y-2">
          <div className="font-medium text-[#E6EDF5]">Dialogue Engine</div>
          <p className="leading-relaxed">
            Uses Gemini multi-speaker synthesis ({providerConfig.provider === 'gemini' ? providerConfig.ttsModel : 'gemini-2.5-flash-preview-tts'}).{' '}
            <button type="button" onClick={onOpenProviders} className="text-[#4F7DF3] hover:text-[#6B93FA]">
              Configure key or model
            </button>
          </p>
        </div>
      </aside>

      {/* Script & Output */}
      <section className="lg:col-span-8 space-y-6">
        <div className="bg-[#12161F] border border-white/[0.08] rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-[#E6EDF5] tracking-tight">
                Dual-Speaker Dialogue
              </h1>
              <p className="text-xs text-[#8D98A8] mt-0.5">
                {voiceA?.name} &amp; {voiceB?.name}
              </p>
            </div>

            <button
              type="button"
              onClick={addTurn}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#E6EDF5] bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Line</span>
            </button>
          </div>

          <div className="space-y-3">
            {turns.map((turn, idx) => (
              <div
                key={turn.id}
                className="flex flex-col sm:flex-row items-stretch sm:items-start gap-3 p-3.5 rounded-lg bg-[#0B0E14] border border-white/[0.06]"
              >
                <div className="flex items-center justify-between sm:w-40 shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateTurn(turn.id, {
                        speakerSlot: turn.speakerSlot === 'A' ? 'B' : 'A',
                      })
                    }
                    className={`w-full px-3 py-2 text-xs font-medium rounded-md text-left truncate transition-colors ${
                      turn.speakerSlot === 'A'
                        ? 'bg-[#4F7DF3]/20 text-[#93B4FF] border border-[#4F7DF3]/30'
                        : 'bg-white/[0.06] text-[#E6EDF5] border border-white/[0.08]'
                    }`}
                    title="Click to toggle speaker"
                  >
                    {idx + 1}. {turn.speakerSlot === 'A' ? voiceA?.name : voiceB?.name}
                  </button>
                </div>

                <textarea
                  rows={2}
                  value={turn.text}
                  onChange={(e) => updateTurn(turn.id, { text: e.target.value })}
                  placeholder="Write spoken dialogue line..."
                  className="flex-1 bg-transparent text-sm text-[#E6EDF5] placeholder:text-[#647082] focus:outline-none resize-none leading-relaxed"
                />

                {turns.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeTurn(turn.id)}
                    aria-label="Remove line"
                    className="p-2 text-[#8D98A8] hover:text-[#EF4444] transition-colors self-end sm:self-start shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSynthesizeDialogue}
              disabled={isGenerating}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-[#4F7DF3] hover:bg-[#3E6BE0] rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isGenerating ? 'Synthesizing Dialogue...' : 'Synthesize Dialogue'}</span>
            </button>
          </div>
        </div>

        <div className="bg-[#12161F] border border-white/[0.08] rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-[#E6EDF5]">Dialogue Master</h2>
          {generatedClip ? (
            <div className="p-4 rounded-lg bg-[#0B0E14] border border-white/[0.06]">
              <WaveformPlayer
                audioBlob={generatedClip.audioBlob}
                peaks={generatedClip.peaks}
                durationSec={generatedClip.durationSec}
                title={`${generatedClip.voiceName} & ${generatedClip.secondaryVoiceName}`}
                subtitle="24 kHz Dual-Speaker WAV"
                downloadFilename="dialogue-master.wav"
              />
            </div>
          ) : (
            <div className="p-8 rounded-lg bg-[#0B0E14] border border-white/[0.06] text-center text-sm text-[#8D98A8]">
              {isGenerating
                ? 'Rendering multi-speaker conversation...'
                : 'Synthesized dialogue audio will appear here for playback and download.'}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
