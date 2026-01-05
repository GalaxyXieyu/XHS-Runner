import { useEffect, useState } from 'react';

const defaultSettings = {
  captureEnabled: false,
  captureFrequencyMinutes: 60,
  captureRateLimitMs: 1000,
  captureRetryCount: 2,
  metricsWindowDays: 7,
};
const metricsList = ['views', 'likes', 'comments', 'saves', 'follows'];

export default function Home() {
  const [keywords, setKeywords] = useState([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [settings, setSettings] = useState(defaultSettings);
  const [status, setStatus] = useState('');
  const [topics, setTopics] = useState([]);
  const [metricsSummary, setMetricsSummary] = useState(null);
  const [appConfig, setAppConfig] = useState({ updateChannel: 'stable', logLevel: 'info' });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (
        typeof window === 'undefined' ||
        !window.settings ||
        !window.keywords ||
        !window.topics ||
        !window.metrics ||
        !window.config
      ) {
        setStatus('IPC not available. Launch via Electron.');
        return;
      }
      const [loadedKeywords, loadedSettings, loadedTopics, loadedMetrics, loadedConfig] = await Promise.all([
        window.keywords.list(),
        window.settings.get(),
        window.topics.list(),
        window.metrics.summary({ windowDays: defaultSettings.metricsWindowDays }),
        window.config.get(),
      ]);
      if (!cancelled) {
        setKeywords(loadedKeywords || []);
        setSettings({ ...defaultSettings, ...loadedSettings });
        setTopics(loadedTopics || []);
        setMetricsSummary(loadedMetrics || null);
        setAppConfig(loadedConfig || appConfig);
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
      metricsWindowDays: Number(settings.metricsWindowDays || 0),
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
      if (window.topics) {
        const refreshed = await window.topics.list();
        setTopics(refreshed || []);
      }
      setStatus(`Capture ${result.status}: ${result.inserted ?? 0}/${result.total ?? 0}`);
    } catch (error) {
      setStatus(`Capture failed: ${error.message || error}`);
    }
  }

  async function handleUpdateTopicStatus(id, nextStatus) {
    if (typeof window === 'undefined' || !window.topics) {
      return;
    }
    try {
      await window.topics.updateStatus({ id, status: nextStatus });
      const refreshed = await window.topics.list();
      setTopics(refreshed || []);
      setStatus(`Topic ${id} moved to ${nextStatus}.`);
    } catch (error) {
      setStatus(`Status update failed: ${error.message || error}`);
    }
  }

  async function handleRefreshMetrics() {
    if (typeof window === 'undefined' || !window.metrics) {
      return;
    }
    const summary = await window.metrics.summary({
      windowDays: Number(settings.metricsWindowDays || defaultSettings.metricsWindowDays),
    });
    setMetricsSummary(summary || null);
  }

  async function handleExportMetrics() {
    if (typeof window === 'undefined' || !window.metrics) {
      return;
    }
    const result = await window.metrics.exportCsv({
      windowDays: Number(settings.metricsWindowDays || defaultSettings.metricsWindowDays),
    });
    setStatus(`Metrics exported: ${result.path}`);
  }

  async function handleSaveConfig() {
    if (typeof window === 'undefined' || !window.config) {
      return;
    }
    const saved = await window.config.set(appConfig);
    setAppConfig(saved);
    setStatus('Config saved.');
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
        <p>Data window (days):</p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <input
            type="number"
            min="1"
            value={settings.metricsWindowDays}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                metricsWindowDays: event.target.value,
              }))
            }
            style={{ width: 120, padding: 8 }}
          />
          <button type="button" onClick={handleRefreshMetrics}>
            Refresh
          </button>
          <button type="button" onClick={handleExportMetrics}>
            Export CSV
          </button>
        </div>
        <p style={{ marginTop: 8 }}>Metrics tracked:</p>
        <ul>
          {metricsList.map((metric) => (
            <li key={metric}>{metric}</li>
          ))}
        </ul>
        {metricsSummary ? (
          <div style={{ marginTop: 12 }}>
            <strong>Totals</strong>
            <ul>
              {metricsSummary.totals.map((row) => (
                <li key={row.metricKey}>
                  {row.metricKey}: {row.total}
                </li>
              ))}
            </ul>
            <strong>Comparison</strong>
            <ul>
              {metricsSummary.comparison.map((row) => (
                <li key={row.metricKey}>
                  {row.metricKey}: {row.current} (prev {row.previous}, Δ {row.delta})
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Topic Workflow</h2>
        {topics.length === 0 ? (
          <p>No captured topics yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {topics.map((topic) => (
              <div
                key={topic.id}
                style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 12, alignItems: 'center' }}
              >
                <div>
                  <strong>{topic.title}</strong>
                  <div style={{ fontSize: 12, color: '#666' }}>{topic.source_id}</div>
                </div>
                <span style={{ padding: '4px 8px', borderRadius: 12, background: '#eef' }}>
                  {topic.status}
                </span>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {topic.allowedStatuses?.length ? (
                    topic.allowedStatuses.map((nextStatus) => (
                      <button
                        key={nextStatus}
                        type="button"
                        onClick={() => handleUpdateTopicStatus(topic.id, nextStatus)}
                      >
                        → {nextStatus}
                      </button>
                    ))
                  ) : (
                    <span style={{ fontSize: 12, color: '#999' }}>No further transitions</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>App Config</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <label htmlFor="updateChannel">
            Update channel
            <select
              id="updateChannel"
              value={appConfig.updateChannel}
              onChange={(event) =>
                setAppConfig((prev) => ({ ...prev, updateChannel: event.target.value }))
              }
              style={{ marginLeft: 8 }}
            >
              <option value="stable">stable</option>
              <option value="beta">beta</option>
            </select>
          </label>
          <label htmlFor="logLevel">
            Log level
            <select
              id="logLevel"
              value={appConfig.logLevel}
              onChange={(event) =>
                setAppConfig((prev) => ({ ...prev, logLevel: event.target.value }))
              }
              style={{ marginLeft: 8 }}
            >
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
          </label>
          <button type="button" onClick={handleSaveConfig}>
            Save config
          </button>
        </div>
      </section>

      <p style={{ marginTop: 24 }}>{status}</p>
    </main>
  );
}
