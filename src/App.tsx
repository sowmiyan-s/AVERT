import { useEffect, useState } from 'react';
import { TopBar, type WorkspaceTab } from './components/TopBar';
import {
  ProtectWorkspace,
  type SampleDescriptor,
} from './components/ProtectWorkspace';
import { VerifyWorkspace } from './components/VerifyWorkspace';
import { EditorLabWorkspace } from './components/EditorLabWorkspace';
import type { ProtectionRecord } from './lib/avertProtocol';

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('protect');
  const [samples, setSamples] = useState<SampleDescriptor[]>([]);
  const [protections, setProtections] = useState<ProtectionRecord[]>([]);
  const [selectedProtectionId, setSelectedProtectionId] = useState<string | null>(null);
  const [focusUploadSignal, setFocusUploadSignal] = useState<number>(0);

  const loadProtections = async () => {
    try {
      const resp = await fetch('/api/v1/protections');
      const data = await resp.json();
      if (Array.isArray(data.protections)) {
        setProtections(data.protections);
        setSelectedProtectionId((prev) => prev ?? data.protections[0]?.protection_id ?? null);
      }
    } catch {
      // ignore initial transient
    }
  };

  useEffect(() => {
    fetch('/api/v1/samples')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.samples)) setSamples(d.samples);
      })
      .catch(() => {});
    void loadProtections();
  }, []);

  const activeProtection =
    protections.find((p) => p.protection_id === selectedProtectionId) ?? protections[0] ?? null;

  const handleProtectionCreated = (record: ProtectionRecord) => {
    setProtections((prev) => [
      record,
      ...prev.filter((p) => p.protection_id !== record.protection_id),
    ]);
    setSelectedProtectionId(record.protection_id);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      <TopBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onPrimaryAction={() => {
          setActiveTab('protect');
          setFocusUploadSignal((n) => n + 1);
        }}
      />

      <main className="flex-1">
        {activeTab === 'protect' && (
          <ProtectWorkspace
            samples={samples}
            activeProtection={activeProtection}
            onProtectionCreated={handleProtectionCreated}
            onNavigateToVerify={(id) => {
              setSelectedProtectionId(id);
              setActiveTab('verify');
            }}
            onNavigateToEditor={(id) => {
              setSelectedProtectionId(id);
              setActiveTab('editor');
            }}
            triggerFocusUploadSignal={focusUploadSignal}
          />
        )}

        {activeTab === 'verify' && (
          <VerifyWorkspace
            protections={protections}
            selectedProtectionId={selectedProtectionId}
            onSelectProtectionId={setSelectedProtectionId}
            onRefreshProtections={loadProtections}
          />
        )}

        {activeTab === 'editor' && (
          <EditorLabWorkspace
            protections={protections}
            selectedProtectionId={selectedProtectionId}
            onSelectProtectionId={setSelectedProtectionId}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-3 text-xs text-slate-500">
          <span>AVERT</span>
        </div>
      </footer>
    </div>
  );
}
