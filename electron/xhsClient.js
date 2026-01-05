const DEFAULT_LIMIT = 50;

function normalizeNotes(payload) {
  const rawList =
    payload?.data?.list ||
    payload?.data ||
    payload?.result ||
    payload?.notes ||
    payload?.items ||
    [];

  return rawList
    .filter(Boolean)
    .map((item, index) => {
      const id = item.id || item.note_id || item.noteId || `${index}`;
      const title = item.title || item.desc || item.name || `Note ${index + 1}`;
      const url = item.url || item.link || item.note_url || null;
      return { id: String(id), title, url };
    });
}

function mockNotes(keyword, limit) {
  return Array.from({ length: limit }, (_, index) => ({
    id: `mock-${keyword}-${index + 1}`,
    title: `Mock note for ${keyword} #${index + 1}`,
    url: null,
  }));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  if (!timeoutMs) {
    return fetch(url, options);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTopNotes(keyword, limit = DEFAULT_LIMIT) {
  const mode = process.env.XHS_MCP_MODE || 'mcp';
  const capped = Math.min(limit, DEFAULT_LIMIT);

  if (mode === 'mock') {
    return mockNotes(keyword, capped);
  }

  const endpoint = process.env.XHS_MCP_ENDPOINT;
  if (!endpoint) {
    throw new Error('XHS_MCP_ENDPOINT is not configured');
  }

  const tool = process.env.XHS_MCP_TOOL || 'search_notes';
  const payload = {
    tool,
    arguments: {
      keyword,
      limit: capped,
    },
  };

  const response = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    Number(process.env.XHS_MCP_TIMEOUT_MS || 15000)
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`XHS MCP request failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  return normalizeNotes(data).slice(0, capped);
}

module.exports = {
  fetchTopNotes,
};
