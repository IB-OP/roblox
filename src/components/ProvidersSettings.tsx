import React, { useState } from 'react';
import { Check, Eye, EyeOff, KeyRound, RotateCcw } from 'lucide-react';
import { ProviderConfig, ProviderId } from '../types/voice';
import {
  DEFAULT_PROVIDER_CONFIG,
  getProviderPreset,
  loadProviderKeysMap,
  PROVIDER_PRESETS,
} from '../utils/providers';

interface ProvidersSettingsProps {
  config: ProviderConfig;
  onChange: (next: ProviderConfig) => void;
  onBackToStudio: () => void;
}

export const ProvidersSettings: React.FC<ProvidersSettingsProps> = ({
  config,
  onChange,
  onBackToStudio,
}) => {
  const [showKey, setShowKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const activePreset = getProviderPreset(config.provider);

  const selectProvider = (providerId: ProviderId) => {
    const preset = getProviderPreset(providerId);
    const savedKeys = loadProviderKeysMap();
    setTestResult(null);
    onChange({
      ...config,
      provider: providerId,
      apiKey: savedKeys[providerId] || '',
      analysisModel: preset.defaultAnalysisModel,
      ttsModel: preset.defaultTtsModel,
      customVoiceId: '',
    });
  };

  const handleTestConnection = async () => {
    setTestResult(null);

    if (config.provider === 'browser') {
      const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
      const count = supported ? window.speechSynthesis.getVoices().length : 0;
      setTestResult({
        ok: supported,
        message: supported
          ? `Browser Web Speech API ready (${count} system voices detected).`
          : 'Web Speech API is not available in this browser.',
      });
      return;
    }

    setIsTesting(true);
    try {
      const res = await fetch('/api/providers/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestResult({ ok: false, message: data.error || 'Connection test failed.' });
      } else {
        setTestResult({ ok: true, message: data.message || 'Connection verified.' });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Network error during connection test.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleResetDefault = () => {
    setTestResult(null);
    onChange({
      ...DEFAULT_PROVIDER_CONFIG,
      apiKey: '',
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Free & Custom Provider List */}
      <aside className="lg:col-span-5 bg-[#12161F] border border-white/[0.08] rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#E6EDF5]">API Providers</h2>
            <p className="text-xs text-[#8D98A8] mt-0.5">
              Keep default Gemini or switch to any free provider or custom model.
            </p>
          </div>
          <button
            type="button"
            onClick={handleResetDefault}
            className="flex items-center gap-1 text-xs text-[#8D98A8] hover:text-[#E6EDF5] transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Default</span>
          </button>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {PROVIDER_PRESETS.map((preset) => {
            const active = preset.id === config.provider;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => selectProvider(preset.id)}
                className={`w-full py-3 px-3 rounded-lg text-left transition-colors flex items-center justify-between gap-3 ${
                  active ? 'bg-[#4F7DF3]/15' : 'hover:bg-white/[0.04]'
                }`}
              >
                <div className="min-w-0">
                  <div className={`text-sm font-medium truncate ${active ? 'text-white' : 'text-[#E6EDF5]'}`}>
                    {preset.name}
                  </div>
                  <div className="text-xs text-[#8D98A8] truncate mt-0.5">
                    {preset.tierNote}
                  </div>
                </div>
                {active && <Check className="w-4 h-4 text-[#4F7DF3] shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Right: Custom API Key & Custom Model Configuration */}
      <section className="lg:col-span-7 bg-[#12161F] border border-white/[0.08] rounded-xl p-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-[#E6EDF5] tracking-tight">
              {activePreset.name}
            </h1>
            <p className="text-xs text-[#8D98A8] mt-1">{activePreset.signupHint}</p>
          </div>

          <button
            type="button"
            onClick={onBackToStudio}
            className="px-3.5 py-2 text-xs font-medium text-[#E6EDF5] bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Back to Studio
          </button>
        </div>

        <div className="text-xs text-[#8D98A8] py-2.5 border-y border-white/[0.06]">
          Capabilities:{' '}
          <span className="text-[#E6EDF5]">
            {[
              activePreset.supportsVoiceCloning ? 'Voice Cloning' : null,
              activePreset.supportsTts ? 'Text-to-Speech' : null,
              activePreset.supportsDialogue ? 'Dual-Speaker Dialogue' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>

        {config.provider === 'cloudflare' && (
          <div>
            <label htmlFor="cloudflare-account-id" className="block text-xs font-medium text-[#8D98A8] mb-1.5">
              Cloudflare Account ID
            </label>
            <input
              id="cloudflare-account-id"
              type="text"
              value={config.accountId || ''}
              onChange={(e) => onChange({ ...config, accountId: e.target.value })}
              placeholder="e.g., 9f2a1b3c4d5e6f7a8b9c0d1e2f3a4b5c"
              className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#0B0E14] border border-white/[0.1] rounded-lg text-[#E6EDF5] placeholder:text-[#647082] focus:outline-none focus:border-[#4F7DF3]"
            />
          </div>
        )}

        {config.provider === 'custom' && (
          <div>
            <label htmlFor="custom-base-url" className="block text-xs font-medium text-[#8D98A8] mb-1.5">
              Custom HTTPS Base URL (OpenAI-compatible)
            </label>
            <input
              id="custom-base-url"
              type="url"
              value={config.customBaseUrl}
              onChange={(e) => onChange({ ...config, customBaseUrl: e.target.value })}
              placeholder="https://api.example.com/v1"
              className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#0B0E14] border border-white/[0.1] rounded-lg text-[#E6EDF5] placeholder:text-[#647082] focus:outline-none focus:border-[#4F7DF3]"
            />
          </div>
        )}

        {config.provider !== 'browser' && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="provider-api-key" className="text-xs font-medium text-[#8D98A8] flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5" />
                <span>
                  {config.provider === 'gemini' ? 'Custom Gemini API Key (Optional)' : 'Provider API Key'}
                </span>
              </label>
              {config.apiKey && (
                <button
                  type="button"
                  onClick={() => onChange({ ...config, apiKey: '' })}
                  className="text-xs text-[#8D98A8] hover:text-[#EF4444] transition-colors"
                >
                  Clear key
                </button>
              )}
            </div>
            <div className="relative flex items-center">
              <input
                id="provider-api-key"
                type={showKey ? 'text' : 'password'}
                value={config.apiKey}
                onChange={(e) => onChange({ ...config, apiKey: e.target.value })}
                placeholder={activePreset.keyPlaceholder}
                autoComplete="off"
                className="w-full pl-3.5 pr-10 py-2.5 text-sm font-mono bg-[#0B0E14] border border-white/[0.1] rounded-lg text-[#E6EDF5] placeholder:text-[#647082] focus:outline-none focus:border-[#4F7DF3]"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
                className="absolute right-2.5 p-1 text-[#8D98A8] hover:text-[#E6EDF5]"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-[#8D98A8] mt-1.5">
              Stored only for your current browser session and forwarded through the local server proxy.
            </p>
          </div>
        )}

        {/* Analysis / Voice Profiling Model */}
        {activePreset.suggestedAnalysisModels.length > 0 && config.provider !== 'browser' && (
          <div className="space-y-2">
            <label htmlFor="analysis-model-input" className="block text-xs font-medium text-[#8D98A8]">
              Voice Profiling / Transcription Model (Preset or Custom ID)
            </label>
            <input
              id="analysis-model-input"
              type="text"
              value={config.analysisModel}
              onChange={(e) => onChange({ ...config, analysisModel: e.target.value })}
              placeholder={activePreset.defaultAnalysisModel}
              className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#0B0E14] border border-white/[0.1] rounded-lg text-[#E6EDF5] focus:outline-none focus:border-[#4F7DF3]"
            />
            <div className="flex flex-wrap gap-1.5">
              {activePreset.suggestedAnalysisModels.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChange({ ...config, analysisModel: m })}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md border transition-colors ${
                    config.analysisModel === m
                      ? 'bg-[#4F7DF3]/20 border-[#4F7DF3]/40 text-white'
                      : 'bg-[#0B0E14] border-white/[0.08] text-[#8D98A8] hover:text-[#E6EDF5]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TTS Synthesis Model */}
        {activePreset.supportsTts && config.provider !== 'browser' && (
          <div className="space-y-2">
            <label htmlFor="tts-model-input" className="block text-xs font-medium text-[#8D98A8]">
              Speech Synthesis (TTS) Model (Preset or Custom ID)
            </label>
            <input
              id="tts-model-input"
              type="text"
              value={config.ttsModel}
              onChange={(e) => onChange({ ...config, ttsModel: e.target.value })}
              placeholder={activePreset.defaultTtsModel}
              className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#0B0E14] border border-white/[0.1] rounded-lg text-[#E6EDF5] focus:outline-none focus:border-[#4F7DF3]"
            />
            <div className="flex flex-wrap gap-1.5">
              {activePreset.suggestedTtsModels.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChange({ ...config, ttsModel: m })}
                  className={`px-2.5 py-1 text-xs font-mono rounded-md border transition-colors ${
                    config.ttsModel === m
                      ? 'bg-[#4F7DF3]/20 border-[#4F7DF3]/40 text-white'
                      : 'bg-[#0B0E14] border-white/[0.08] text-[#8D98A8] hover:text-[#E6EDF5]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        {(config.provider === 'elevenlabs' ||
          config.provider === 'groq' ||
          config.provider === 'cloudflare' ||
          config.provider === 'custom') && (
          <div>
            <label htmlFor="custom-voice-id" className="block text-xs font-medium text-[#8D98A8] mb-1.5">
              Custom Remote Voice / Speaker ID (Optional)
            </label>
            <input
              id="custom-voice-id"
              type="text"
              value={config.customVoiceId}
              onChange={(e) => onChange({ ...config, customVoiceId: e.target.value })}
              placeholder={
                config.provider === 'cloudflare'
                  ? 'e.g., asteria, luna, orion, zeus (for Aura TTS)'
                  : 'Leave blank to use cloned or mapped voice'
              }
              className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#0B0E14] border border-white/[0.1] rounded-lg text-[#E6EDF5] placeholder:text-[#647082] focus:outline-none focus:border-[#4F7DF3]"
            />
          </div>
        )}

        <div className="pt-4 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            className="px-4 py-2 text-xs font-medium text-white bg-[#4F7DF3] hover:bg-[#3E6BE0] rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {isTesting ? 'Testing Connection...' : 'Test Connection'}
          </button>

          {testResult && (
            <span
              className={`text-xs ${
                testResult.ok ? 'text-[#4ADE80]' : 'text-[#FCA5A5]'
              }`}
            >
              {testResult.message}
            </span>
          )}
        </div>
      </section>
    </div>
  );
};
