const DEFAULT_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

async function generateContent(prompt) {
  const mode = process.env.NANOBANANA_MODE || 'mock';
  const endpoint = process.env.NANOBANANA_ENDPOINT;

  if (mode === 'mock' || !endpoint) {
    return {
      text: `Mock caption for: ${prompt}`,
      imageBuffer: Buffer.from(DEFAULT_IMAGE_BASE64, 'base64'),
      metadata: { mode: 'mock' },
    };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Nanobanana request failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  return {
    text: data.text || '',
    imageBuffer: Buffer.from(data.image_base64, 'base64'),
    metadata: { mode: 'remote' },
  };
}

module.exports = {
  generateContent,
};
