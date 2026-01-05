import { useEffect, useState } from 'react';

const emptySettings = { keyword: '' };

export default function Home() {
  const [settings, setSettings] = useState(emptySettings);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (typeof window === 'undefined' || !window.settings) {
        setStatus('IPC not available. Launch via Electron.');
        return;
      }
      const loaded = await window.settings.get();
      if (!cancelled) {
        setSettings({ ...emptySettings, ...loaded });
        setStatus('Loaded settings from IPC.');
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    if (!window.settings) {
      setStatus('IPC not available.');
      return;
    }
    const saved = await window.settings.set({ keyword: settings.keyword });
    setSettings({ ...emptySettings, ...saved });
    setStatus('Saved settings via IPC.');
  }

  return (
    <main style={{ padding: 32, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Electron + Next.js IPC Demo</h1>
      <p>IPC channels: settings:get / settings:set</p>
      <label htmlFor="keyword">Keyword (sample)</label>
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <input
          id="keyword"
          type="text"
          value={settings.keyword}
          onChange={(event) =>
            setSettings((prev) => ({ ...prev, keyword: event.target.value }))
          }
          style={{ flex: 1, padding: 8 }}
        />
        <button type="button" onClick={handleSave} style={{ padding: '8px 16px' }}>
          Save
        </button>
      </div>
      <p style={{ marginTop: 16 }}>{status}</p>
    </main>
  );
}
