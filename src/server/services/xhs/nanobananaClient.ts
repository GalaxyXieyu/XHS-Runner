import { getSetting } from '../../settings';

const DEFAULT_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

export async function generateContent(prompt: string) {
  const mode = process.env.NANOBANANA_MODE || (await getSetting('nanobananaMode')) || 'mock';
  const endpoint = process.env.NANOBANANA_ENDPOINT || (await getSetting('nanobananaEndpoint'));
  const apiKey = process.env.NANOBANANA_API_KEY || (await getSetting('nanobananaApiKey'));

  if (mode === 'mock' || !endpoint) {
    return {
      text: `Mock caption for: ${prompt}`,
      imageBuffer: Buffer.from(DEFAULT_IMAGE_BASE64, 'base64'),
      metadata: { mode: 'mock' },
    };
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
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
