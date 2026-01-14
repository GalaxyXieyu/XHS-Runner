import { getSetting } from '../../../settings';

function stripBase64Header(base64: string) {
  return base64.replace(/^data:image\/[^;]+;base64,/, '');
}

export async function generateContent(prompt: string) {
  const endpoint = process.env.NANOBANANA_ENDPOINT || (await getSetting('nanobananaEndpoint'));
  const apiKey = process.env.NANOBANANA_API_KEY || (await getSetting('nanobananaApiKey'));

  if (!prompt || !String(prompt).trim()) {
    throw new Error('PROMPT_REQUIRED: prompt is required');
  }

  if (!endpoint) {
    throw new Error('NANOBANANA_NOT_CONFIGURED: 请先配置 Nanobanana Endpoint');
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
  if (!data || typeof data !== 'object') {
    throw new Error('Nanobanana response invalid: expected JSON object');
  }

  const imageBase64Raw = (data as any).image_base64;
  if (!imageBase64Raw || typeof imageBase64Raw !== 'string') {
    throw new Error('Nanobanana response invalid: image_base64 missing');
  }

  const imageBase64 = stripBase64Header(imageBase64Raw);
  return {
    text: typeof (data as any).text === 'string' ? (data as any).text : '',
    imageBuffer: Buffer.from(imageBase64, 'base64'),
    metadata: { mode: 'remote' },
  };
}
