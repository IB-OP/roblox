import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Search, Trash2 } from 'lucide-react';
import { GeneratedClip, VoiceProfile } from '../types/voice';
import { WaveformPlayer } from './WaveformPlayer';

interface HistoryLibraryProps {
  clips: GeneratedClip[];
  voices: VoiceProfile[];
  onLoadInStudio: (clip: GeneratedClip) => void;
  onDeleteClip: (id: string) => Promise<void>;
  onGoToStudio: () => void;
}

export const HistoryLibrary: React.FC<HistoryLibraryProps> = ({
  clips,
  voices,
  onLoadInStudio,
  onDeleteClip,
  onGoToStudio,
}) => {
  const [search, setSearch] = useState('');
  const [voiceFilter, setVoiceFilter] = useState('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clips.filter((c) => {
      if (voiceFilter !== 'all' && c.voiceId !== voiceFilter && c.secondaryVoiceId !== voiceFilter) {
        return false;
      }
      if (!q) return true;
      return (
        c.text.toLowerCase().includes(q) ||
        c.voiceName.toLowerCase().includes(q) ||
        (c.secondaryVoiceName && c.secondaryVoiceName.toLowerCase().includes(q))
      );
    });
  }, [clips, search, voiceFilter]);

  return (
    <div className="bg-[#12161F] border border-white/[0.08] rounded-xl p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#E6EDF5] tracking-tight">
            Synthesis History
          </h1>
          <p className="text-xs text-[#8D98A8] mt-1">
            All generated speech takes saved locally in your browser studio.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#8D98A8] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search scripts..."
              className="pl-9 pr-3 py-2 text-xs bg-[#0B0E14] border border-white/[0.1] rounded-lg text-[#E6EDF5] placeholder:text-[#647082] focus:outline-none focus:border-[#4F7DF3] w-52"
            />
          </div>

          <select
            aria-label="Filter by voice"
            value={voiceFilter}
            onChange={(e) => setVoiceFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-[#0B0E14] border border-white/[0.1] rounded-lg text-[#E6EDF5] focus:outline-none focus:border-[#4F7DF3]"
          >
            <option value="all">All Voices</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center space-y-3 border-t border-white/[0.06]">
          <p className="text-sm font-medium text-[#E6EDF5]">
            {clips.length === 0 ? 'No generated audio clips yet' : 'No matching clips found'}
          </p>
          <p className="text-xs text-[#8D98A8]">
            {clips.length === 0
              ? 'Synthesize your first take in Speech Studio to see waveforms and downloads here.'
              : 'Try clearing your search or voice filter.'}
          </p>
          {clips.length === 0 && (
            <button
              type="button"
              onClick={onGoToStudio}
              className="mt-2 px-4 py-2 text-xs font-medium text-white bg-[#4F7DF3] hover:bg-[#3E6BE0] rounded-lg transition-colors"
            >
              Open Speech Studio
            </button>
          )}
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
          {filtered.map((clip) => {
            const title =
              clip.mode === 'dialogue' && clip.secondaryVoiceName
                ? `${clip.voiceName} & ${clip.secondaryVoiceName}`
                : clip.voiceName;
            const dateStr = new Date(clip.createdAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div key={clip.id} className="py-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium text-[#E6EDF5]">
                      <span className="truncate">{title}</span>
                    </div>
                    <div className="text-xs text-[#8D98A8] mt-0.5 font-mono tabular-nums">
                      {clip.mode === 'dialogue' ? 'Dialogue' : clip.emotion} ·{' '}
                      {clip.durationSec.toFixed(1)}s · {dateStr}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {clip.mode === 'single' && (
                      <button
                        type="button"
                        onClick={() => onLoadInStudio(clip)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#E6EDF5] bg-white/[0.06] hover:bg-white/[0.12] rounded-md transition-colors whitespace-nowrap"
                      >
                        <span>Load Script</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteClip(clip.id)}
                      aria-label="Delete clip"
                      className="p-1.5 text-[#8D98A8] hover:text-[#EF4444] transition-colors rounded-md"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <p className="text-xs text-[#E6EDF5]/80 leading-relaxed line-clamp-2">
                  {clip.text}
                </p>

                <div className="p-3 rounded-lg bg-[#0B0E14] border border-white/[0.06]">
                  <WaveformPlayer
                    audioBlob={clip.audioBlob}
                    peaks={clip.peaks}
                    durationSec={clip.durationSec}
                    downloadFilename={`${clip.voiceName.toLowerCase().replace(/\s+/g, '-')}-${clip.id}.wav`}
                    compact
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
