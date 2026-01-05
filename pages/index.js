import { useEffect, useState } from 'react';

const defaultSettings = {
  captureEnabled: false,
  captureFrequencyMinutes: 60,
  captureRateLimitMs: 1000,
  captureRetryCount: 2,
};
const metricsList = ['views', 'likes', 'comments', 'saves', 'follows'];

export default function Home() {
  const [keywords, setKeywords] = useState([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [settings, setSettings] = useState(defaultSettings);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (typeof window === 'undefined' || !window.settings || !window.keywords) {
        setStatus('IPC not available. Launch via Electron.');
        return;
      }
      const [loadedKeywords, loadedSettings] = await Promise.all([
        window.keywords.list(),
        window.settings.get(),
      ]);
      if (!cancelled) {
        setKeywords(loadedKeywords || []);
        setSettings({ ...defaultSettings, ...loadedSettings });
        setStatus('Loaded settings from IPC.');
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleAddKeyword() {
    if (typeof window === 'undefined' || !window.settings || !window.keywords) {
      return;
    }
    const value = newKeyword.trim();
    if (!value) {
      return;
    }
    await window.keywords.add(value);
    setNewKeyword('');
    const updated = await window.keywords.list();
    setKeywords(updated || []);
    setStatus('Keyword added.');
  }

  async function handleSaveKeyword(id) {
    if (typeof window === 'undefined' || !window.settings || !window.keywords) {
      return;
    }
    const target = keywords.find((item) => item.id === id);
    if (!target) {
      return;
    }
    await window.keywords.update({ id, value: target.value, isEnabled: target.is_enabled });
    setStatus('Keyword updated.');
  }

  async function handleRemoveKeyword(id) {
    if (typeof window === 'undefined' || !window.settings || !window.keywords) {
      return;
    }
    await window.keywords.remove(id);
    const updated = await window.keywords.list();
    setKeywords(updated || []);
    setStatus('Keyword removed.');
  }

  async function handleSaveSettings() {
    if (typeof window === 'undefined' || !window.settings || !window.keywords) {
      return;
    }
    const payload = {
      captureEnabled: Boolean(settings.captureEnabled),
      captureFrequencyMinutes: Number(settings.captureFrequencyMinutes || 0),
      captureRateLimitMs: Number(settings.captureRateLimitMs || 0),
      captureRetryCount: Number(settings.captureRetryCount || 0),
    };
    const saved = await window.settings.set(payload);
    setSettings({ ...defaultSettings, ...saved });
    setStatus('Capture frequency saved.');
  }

  async function handleRunCapture(id) {
    if (typeof window === 'undefined' || !window.capture) {
      return;
    }
    try {
      const result = await window.capture.run({ keywordId: id, limit: 50 });
      setStatus(`Capture ${result.status}: ${result.inserted ?? 0}/${result.total ?? 0}`);
    } catch (error) {
      setStatus(`Capture failed: ${error.message || error}`);
    }
  }

  return (
    <main style={{ padding: 32, fontFamily: 'system-ui, sans-serif', maxWidth: 900 }}>
      <h1>XHS Generator Settings</h1>
      <p>IPC channels: settings:get / settings:set / keywords:*</p>

      <section style={{ marginTop: 24 }}>
        <h2>Keyword Capture</h2>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <input
            type="text"
            value={newKeyword}
            placeholder="Add keyword"
            onChange={(event) => setNewKeyword(event.target.value)}
            style={{ flex: 1, padding: 8 }}
          />
          <button type="button" onClick={handleAddKeyword} style={{ padding: '8px 16px' }}>
            Add
          </button>
        </div>
        {keywords.length === 0 ? (
          <p>No keywords yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {keywords.map((item) => (
              <div
                key={item.id}
                style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 8 }}
              >
                <input
                  type="text"
                  value={item.value}
                  onChange={(event) =>
                    setKeywords((prev) =>
                      prev.map((row) =>
                        row.id === item.id ? { ...row, value: event.target.value } : row
                      )
                    )
                  }
                  style={{ padding: 8 }}
                />
                <button type="button" onClick={() => handleSaveKeyword(item.id)}>
                  Save
                </button>
                <button type="button" onClick={() => handleRemoveKeyword(item.id)}>
                  Remove
                </button>
                <button type="button" onClick={() => handleRunCapture(item.id)}>
                  Run capture
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Capture Frequency (minutes)</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            type="number"
            min="1"
            value={settings.captureFrequencyMinutes}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                captureFrequencyMinutes: event.target.value,
              }))
            }
            style={{ width: 160, padding: 8 }}
          />
          <button type="button" onClick={handleSaveSettings}>
            Save
          </button>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Capture Controls</h2>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="captureEnabled">
            <input
              id="captureEnabled"
              type="checkbox"
              checked={settings.captureEnabled}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, captureEnabled: event.target.checked }))
              }
              style={{ marginRight: 6 }}
            />
            Enable capture
          </label>
          <label htmlFor="captureRateLimitMs">
            Rate limit (ms)
            <input
              id="captureRateLimitMs"
              type="number"
              min="0"
              value={settings.captureRateLimitMs}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, captureRateLimitMs: event.target.value }))
              }
              style={{ width: 120, marginLeft: 8, padding: 6 }}
            />
          </label>
          <label htmlFor="captureRetryCount">
            Retry count
            <input
              id="captureRetryCount"
              type="number"
              min="0"
              value={settings.captureRetryCount}
              onChange={(event) =>
                setSettings((prev) => ({ ...prev, captureRetryCount: event.target.value }))
              }
              style={{ width: 80, marginLeft: 8, padding: 6 }}
            />
          </label>
        </div>
        <p style={{ marginTop: 8 }}>
          Capture requests require XHS_MCP_ENDPOINT. Use XHS_MCP_MODE=mock for local dry runs.
        </p>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Metrics Scope</h2>
        <p>Data window: last 7 days. Metrics tracked:</p>
        <ul>
          {metricsList.map((metric) => (
            <li key={metric}>{metric}</li>
          ))}
        </ul>
      </section>

      <p style={{ marginTop: 24 }}>{status}</p>
    </main>
  );
}
