import { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { GeneratedClip, ProviderConfig, VoiceProfile } from './types/voice';
import {
  deleteClipById,
  deleteVoiceById,
  loadClips,
  saveClip,
  saveVoice,
  seedStarterVoicesIfNeeded,
} from './utils/storage';
import { loadProviderConfig, saveProviderConfig } from './utils/providers';
import { SpeechStudio } from './components/SpeechStudio';
import { VoiceLab } from './components/VoiceLab';
import { DialogueStudio } from './components/DialogueStudio';
import { HistoryLibrary } from './components/HistoryLibrary';
import { ProvidersSettings } from './components/ProvidersSettings';

type ActiveTab = 'studio' | 'lab' | 'dialogue' | 'history' | 'providers';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('studio');
  const [voices, setVoices] = useState<VoiceProfile[]>([]);
  const [clips, setClips] = useState<GeneratedClip[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('');
  const [studioDraftText, setStudioDraftText] = useState<string | undefined>(undefined);
  const [providerConfig, setProviderConfig] = useState<ProviderConfig>(() => loadProviderConfig());
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [loadedVoices, loadedClips] = await Promise.all([
          seedStarterVoicesIfNeeded(),
          loadClips(),
        ]);
        if (cancelled) return;
        setVoices(loadedVoices);
        setClips(loadedClips);
        if (loadedVoices.length > 0) {
          setSelectedVoiceId(loadedVoices[0].id);
        }
      } catch {
        if (!cancelled) {
          setErrorMsg('Unable to initialize local studio storage.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUpdateProviderConfig = (next: ProviderConfig) => {
    setProviderConfig(next);
    saveProviderConfig(next);
  };

  const handleVoiceCreated = async (voice: VoiceProfile) => {
    await saveVoice(voice);
    setVoices((prev) => [voice, ...prev]);
    setSelectedVoiceId(voice.id);
  };

  const handleVoiceUpdated = async (voice: VoiceProfile) => {
    await saveVoice(voice);
    setVoices((prev) => prev.map((v) => (v.id === voice.id ? voice : v)));
  };

  const handleVoiceDeleted = async (id: string) => {
    await deleteVoiceById(id);
    setVoices((prev) => {
      const next = prev.filter((v) => v.id !== id);
      if (selectedVoiceId === id && next.length > 0) {
        setSelectedVoiceId(next[0].id);
      }
      return next;
    });
  };

  const handleClipGenerated = async (clip: GeneratedClip) => {
    await saveClip(clip);
    setClips((prev) => [clip, ...prev]);
  };

  const handleDeleteClip = async (id: string) => {
    await deleteClipById(id);
    setClips((prev) => prev.filter((c) => c.id !== id));
  };

  const handleLoadClipInStudio = (clip: GeneratedClip) => {
    if (voices.some((v) => v.id === clip.voiceId)) {
      setSelectedVoiceId(clip.voiceId);
    }
    setStudioDraftText(clip.text);
    setActiveTab('studio');
  };

  const navItems: { id: ActiveTab; label: string }[] = [
    { id: 'studio', label: 'Speech Studio' },
    { id: 'lab', label: 'Voice Lab' },
    { id: 'dialogue', label: 'Dialogue' },
    { id: 'history', label: 'History' },
    { id: 'providers', label: 'Providers' },
  ];

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#E6EDF5] flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="border-b border-white/[0.08] bg-[#0B0E14]/95 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1280px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#studio"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('studio');
            }}
            className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            Timbre Studio
          </a>

          <nav className="flex items-center gap-6 overflow-x-auto" aria-label="Workspace navigation">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`py-5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-[#4F7DF3] text-white'
                      : 'border-transparent text-[#8D98A8] hover:text-[#E6EDF5]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="shrink-0 hidden sm:block">
            <button
              type="button"
              onClick={() => setActiveTab('lab')}
              className="px-4 py-2 text-xs font-medium text-white bg-[#4F7DF3] hover:bg-[#3E6BE0] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Clone New Voice
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-8 space-y-6">
        {errorMsg && (
          <div
            role="alert"
            className="flex items-center justify-between gap-4 px-4 py-3 rounded-lg bg-[#DC2626]/15 border border-[#DC2626]/30 text-sm text-[#FCA5A5]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertCircle className="w-4 h-4 text-[#EF4444] shrink-0" />
              <span className="truncate">{errorMsg}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('providers')}
                className="text-xs font-medium text-white underline underline-offset-2 hover:text-[#93B4FF] whitespace-nowrap"
              >
                Switch Provider / Key
              </button>
              <button
                type="button"
                onClick={() => setErrorMsg('')}
                aria-label="Dismiss error"
                className="p-1 text-[#FCA5A5] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 h-96 rounded-xl bg-[#12161F] border border-white/[0.06] animate-pulse" />
            <div className="lg:col-span-7 h-96 rounded-xl bg-[#12161F] border border-white/[0.06] animate-pulse" />
          </div>
        ) : (
          <>
            {activeTab === 'studio' && (
              <SpeechStudio
                key={studioDraftText ? `draft-${studioDraftText.slice(0, 12)}` : 'studio-main'}
                voices={voices}
                selectedVoiceId={selectedVoiceId}
                providerConfig={providerConfig}
                onSelectVoice={setSelectedVoiceId}
                onUpdateVoice={handleVoiceUpdated}
                onUpdateProviderConfig={handleUpdateProviderConfig}
                onClipGenerated={handleClipGenerated}
                onGoToVoiceLab={() => setActiveTab('lab')}
                onOpenProviders={() => setActiveTab('providers')}
                initialText={studioDraftText}
                onError={setErrorMsg}
              />
            )}

            {activeTab === 'lab' && (
              <VoiceLab
                voices={voices}
                selectedVoiceId={selectedVoiceId}
                providerConfig={providerConfig}
                onVoiceCreated={handleVoiceCreated}
                onVoiceUpdated={handleVoiceUpdated}
                onVoiceDeleted={handleVoiceDeleted}
                onUseInStudio={(voiceId) => {
                  setSelectedVoiceId(voiceId);
                  setActiveTab('studio');
                }}
                onOpenProviders={() => setActiveTab('providers')}
                onError={setErrorMsg}
              />
            )}

            {activeTab === 'dialogue' && (
              <DialogueStudio
                voices={voices}
                providerConfig={providerConfig}
                onClipGenerated={handleClipGenerated}
                onOpenProviders={() => setActiveTab('providers')}
                onError={setErrorMsg}
              />
            )}

            {activeTab === 'history' && (
              <HistoryLibrary
                clips={clips}
                voices={voices}
                onLoadInStudio={handleLoadClipInStudio}
                onDeleteClip={handleDeleteClip}
                onGoToStudio={() => setActiveTab('studio')}
              />
            )}

            {activeTab === 'providers' && (
              <ProvidersSettings
                config={providerConfig}
                onChange={handleUpdateProviderConfig}
                onBackToStudio={() => setActiveTab('studio')}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
