import { AcousticStats, VoiceDspSettings } from '../types/voice';

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read audio blob as base64.'));
        return;
      }
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('FileReader failed on audio blob.'));
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64: string, mimeType = 'audio/wav'): Blob {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function extractPeaks(channelData: Float32Array, barCount = 72): number[] {
  const step = Math.max(1, Math.floor(channelData.length / barCount));
  const peaks: number[] = [];
  let maxGlobal = 0.001;

  for (let i = 0; i < barCount; i++) {
    const start = i * step;
    const end = Math.min(channelData.length, start + step);
    let peak = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > peak) peak = abs;
    }
    if (peak > maxGlobal) maxGlobal = peak;
    peaks.push(peak);
  }

  return peaks.map((p) => Math.max(0.06, Math.min(1, p / maxGlobal)));
}

function estimatePitchHz(samples: Float32Array, sampleRate: number): number | null {
  const frameSize = 2048;
  const hopSize = 1024;
  const minLag = Math.floor(sampleRate / 380); // ~380 Hz max F0
  const maxLag = Math.floor(sampleRate / 65);  // ~65 Hz min F0

  if (samples.length < frameSize + maxLag) return null;

  const detectedF0s: number[] = [];

  for (let offset = 0; offset + frameSize <= samples.length; offset += hopSize) {
    let rms = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = samples[offset + i];
      rms += s * s;
    }
    rms = Math.sqrt(rms / frameSize);
    if (rms < 0.015) continue; // skip unvoiced / silence

    let bestLag = -1;
    let bestCorr = 0;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let num = 0;
      let denA = 0;
      let denB = 0;
      for (let i = 0; i < frameSize - lag; i += 2) {
        const a = samples[offset + i];
        const b = samples[offset + i + lag];
        num += a * b;
        denA += a * a;
        denB += b * b;
      }
      const denom = Math.sqrt(denA * denB);
      const corr = denom > 0 ? num / denom : 0;
      if (corr > bestCorr) {
        bestCorr = corr;
        bestLag = lag;
      }
    }

    if (bestLag > 0 && bestCorr > 0.62) {
      detectedF0s.push(sampleRate / bestLag);
    }
  }

  if (detectedF0s.length === 0) return null;
  detectedF0s.sort((a, b) => a - b);
  return Math.round(detectedF0s[Math.floor(detectedF0s.length / 2)]);
}

function estimateSpectralCentroidHz(samples: Float32Array, sampleRate: number): number | null {
  // Zero-crossing + first-difference energy ratio approximation on voiced window
  const len = Math.min(samples.length, sampleRate * 6);
  if (len < 1024) return null;

  let zeroCrossings = 0;
  let energy = 0;
  for (let i = 1; i < len; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    energy += curr * curr;
    if ((prev >= 0 && curr < 0) || (prev < 0 && curr >= 0)) {
      zeroCrossings++;
    }
  }

  if (energy < 1e-4) return null;
  const duration = len / sampleRate;
  const zcrHz = zeroCrossings / (2 * duration);
  return Math.round(Math.max(400, Math.min(6000, zcrHz * 1.45)));
}

export async function analyzeAudioBlob(blob: Blob): Promise<AcousticStats> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();

  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const channelData = decoded.getChannelData(0);

    let sumSq = 0;
    let peakAmp = 0.0001;
    for (let i = 0; i < channelData.length; i++) {
      const s = channelData[i];
      const abs = Math.abs(s);
      if (abs > peakAmp) peakAmp = abs;
      sumSq += s * s;
    }

    const rms = Math.max(0.0001, Math.sqrt(sumSq / Math.max(1, channelData.length)));
    const rmsDb = Math.round(20 * Math.log10(rms) * 10) / 10;
    const peakDb = 20 * Math.log10(peakAmp);
    const dynamicRangeDb = Math.max(3, Math.round((peakDb - rmsDb) * 10) / 10);

    return {
      durationSec: decoded.duration,
      sampleRate: decoded.sampleRate,
      pitchHz: estimatePitchHz(channelData, decoded.sampleRate),
      spectralCentroidHz: estimateSpectralCentroidHz(channelData, decoded.sampleRate),
      rmsDb,
      dynamicRangeDb,
      peaks: extractPeaks(channelData, 72),
    };
  } finally {
    await ctx.close().catch(() => {});
  }
}

export function encodeWavFromAudioBuffer(buffer: AudioBuffer): Blob {
  const numChannels = 1; // Mono studio mixdown for clean voice synthesis
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const mono = new Float32Array(length);

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const chData = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += chData[i] / buffer.numberOfChannels;
    }
  }

  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < length; i++) {
    const clamped = Math.max(-1, Math.min(1, mono[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export async function convertBlobToWav(blob: Blob): Promise<Blob> {
  if (blob.type === 'audio/wav' || blob.type === 'audio/x-wav') {
    return blob;
  }
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    return encodeWavFromAudioBuffer(decoded);
  } finally {
    await ctx.close().catch(() => {});
  }
}

export async function renderProcessedAudio(
  sourceBlob: Blob,
  dsp: VoiceDspSettings
): Promise<{ blob: Blob; durationSec: number; peaks: number[] }> {
  const arrayBuffer = await sourceBlob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const tempCtx = new AudioCtx();

  let decoded: AudioBuffer;
  try {
    decoded = await tempCtx.decodeAudioData(arrayBuffer);
  } finally {
    await tempCtx.close().catch(() => {});
  }

  const isNeutral =
    Math.abs(dsp.pitchSemitones) < 0.05 &&
    Math.abs(dsp.speed - 1) < 0.01 &&
    Math.abs(dsp.warmthDb) < 0.1 &&
    Math.abs(dsp.presenceDb) < 0.1;

  if (isNeutral) {
    return {
      blob: sourceBlob,
      durationSec: decoded.duration,
      peaks: extractPeaks(decoded.getChannelData(0), 72),
    };
  }

  const playbackRate = Math.max(0.75, Math.min(1.35, dsp.speed));
  const outLength = Math.max(1, Math.ceil(decoded.length / playbackRate));
  const offline = new OfflineAudioContext(1, outLength, decoded.sampleRate);

  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.playbackRate.value = playbackRate;
  source.detune.value = dsp.pitchSemitones * 100;

  const warmthFilter = offline.createBiquadFilter();
  warmthFilter.type = 'lowshelf';
  warmthFilter.frequency.value = 220;
  warmthFilter.gain.value = dsp.warmthDb;

  const presenceFilter = offline.createBiquadFilter();
  presenceFilter.type = 'highshelf';
  presenceFilter.frequency.value = 3400;
  presenceFilter.gain.value = dsp.presenceDb;

  const compressor = offline.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.15;

  source.connect(warmthFilter);
  warmthFilter.connect(presenceFilter);
  presenceFilter.connect(compressor);
  compressor.connect(offline.destination);

  source.start(0);
  const rendered = await offline.startRendering();
  const wavBlob = encodeWavFromAudioBuffer(rendered);

  return {
    blob: wavBlob,
    durationSec: rendered.duration,
    peaks: extractPeaks(rendered.getChannelData(0), 72),
  };
}
