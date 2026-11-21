import React, { useEffect, useRef, useState } from 'react';
import { Download, Pause, Play } from 'lucide-react';
import { formatDuration } from '../utils/audio';

interface WaveformPlayerProps {
  audioBlob: Blob | null;
  peaks: number[];
  durationSec?: number;
  title?: string;
  subtitle?: string;
  downloadFilename?: string;
  compact?: boolean;
  accentColor?: string;
}

export const WaveformPlayer: React.FC<WaveformPlayerProps> = ({
  audioBlob,
  peaks,
  durationSec = 0,
  title,
  subtitle,
  downloadFilename,
  compact = false,
  accentColor = '#4F7DF3',
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [resolvedDuration, setResolvedDuration] = useState(durationSec);

  useEffect(() => {
    setResolvedDuration(durationSec);
  }, [durationSec]);

  useEffect(() => {
    if (!audioBlob) {
      setAudioUrl(null);
      setIsPlaying(false);
      setCurrentTime(0);
      return;
    }

    const url = URL.createObjectURL(audioBlob);
    setAudioUrl(url);
    setIsPlaying(false);
    setCurrentTime(0);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [audioBlob]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const bars = peaks.length > 0 ? peaks : Array.from({ length: 64 }, () => 0.14);
    const gap = 2;
    const barWidth = Math.max(2, (width - gap * (bars.length - 1)) / bars.length);
    const progress = resolvedDuration > 0 ? Math.min(1, currentTime / resolvedDuration) : 0;

    bars.forEach((amp, i) => {
      const x = i * (barWidth + gap);
      const barRatio = i / bars.length;
      const barH = Math.max(4, amp * (height - 4));
      const y = (height - barH) / 2;

      ctx.fillStyle = barRatio <= progress ? accentColor : 'rgba(255, 255, 255, 0.16)';
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, Math.min(2, barWidth / 2));
      ctx.fill();
    });
  }, [peaks, currentTime, resolvedDuration, accentColor]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas || !resolvedDuration) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const nextTime = ratio * resolvedDuration;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = downloadFilename || 'timbre-studio-output.wav';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className={compact ? 'flex items-center gap-3' : 'space-y-3'}>
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            if (Number.isFinite(e.currentTarget.duration) && e.currentTarget.duration > 0) {
              setResolvedDuration(e.currentTarget.duration);
            }
          }}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          className="hidden"
        />
      )}

      {!compact && (title || subtitle) && (
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            {title && <p className="text-sm font-medium text-[#E6EDF5] truncate">{title}</p>}
            {subtitle && <p className="text-xs text-[#8D98A8] truncate">{subtitle}</p>}
          </div>
          <span className="font-mono text-xs tabular-nums text-[#8D98A8] shrink-0">
            {formatDuration(currentTime)} / {formatDuration(resolvedDuration)}
          </span>
        </div>
      )}

      <div className="flex items-center gap-3 w-full">
        <button
          type="button"
          onClick={togglePlay}
          disabled={!audioUrl}
          aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
          className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#4F7DF3] text-white hover:bg-[#3E6BE0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F7DF3]"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>

        <div className="flex-1 min-w-0">
          <canvas
            ref={canvasRef}
            onClick={handleSeek}
            className={`w-full ${compact ? 'h-9' : 'h-14'} cursor-pointer block`}
            title="Click to seek"
          />
        </div>

        {compact && (
          <span className="font-mono text-xs tabular-nums text-[#8D98A8] shrink-0">
            {formatDuration(isPlaying ? currentTime : resolvedDuration)}
          </span>
        )}

        {downloadFilename && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={!audioUrl}
            aria-label="Download WAV"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#E6EDF5] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.08] rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#4F7DF3]"
          >
            <Download className="w-3.5 h-3.5" />
            <span>WAV</span>
          </button>
        )}
      </div>
    </div>
  );
};
