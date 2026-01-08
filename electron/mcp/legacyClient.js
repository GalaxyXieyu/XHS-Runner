const DEFAULT_TIMEOUT_MS = Number(process.env.XHS_MCP_TIMEOUT_MS || 15000);

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

async function callTool(tool, args) {
  const endpoint = process.env.XHS_MCP_ENDPOINT;
  if (!endpoint) {
    throw new Error('XHS_MCP_ENDPOINT is not configured');
  }

  const payload = {
    tool,
    arguments: args || {},
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
    DEFAULT_TIMEOUT_MS
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`XHS MCP request failed: ${response.status} ${body}`);
  }

  return response.json();
}

module.exports = {
  callTool,
};
