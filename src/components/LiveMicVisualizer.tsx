import React, { useEffect, useRef } from 'react';

interface LiveMicVisualizerProps {
  analyser: AnalyserNode | null;
  isRecording: boolean;
}

export const LiveMicVisualizer: React.FC<LiveMicVisualizerProps> = ({ analyser, isRecording }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;

    const drawIdle = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const barCount = 48;
      const gap = 3;
      const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + gap);
        ctx.beginPath();
        ctx.roundRect(x, height / 2 - 2, barWidth, 4, 2);
        ctx.fill();
      }
    };

    if (!analyser || !isRecording) {
      drawIdle();
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const renderFrame = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width > 0 && height > 0) {
        if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
          canvas.width = width * dpr;
          canvas.height = height * dpr;
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        analyser.getByteFrequencyData(dataArray);

        const barCount = 48;
        const gap = 3;
        const barWidth = Math.max(2, (width - gap * (barCount - 1)) / barCount);
        const usableBins = Math.floor(bufferLength * 0.55);

        for (let i = 0; i < barCount; i++) {
          const binIndex = Math.floor((i / barCount) * usableBins);
          const value = dataArray[binIndex] / 255;
          const barHeight = Math.max(4, value * (height - 8));
          const x = i * (barWidth + gap);
          const y = (height - barHeight) / 2;

          ctx.fillStyle = value > 0.65 ? '#EF4444' : '#4F7DF3';
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 2);
          ctx.fill();
        }
      }
      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [analyser, isRecording]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-24 block rounded-lg bg-[#0B0E14] border border-white/[0.06]"
      aria-label="Live microphone input meter"
    />
  );
};
