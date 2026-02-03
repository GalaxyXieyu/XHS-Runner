function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({ ok: true, timestamp: new Date().toISOString() });
}

// Allow both CommonJS require() (smoke tests) and Next.js default import interop.
module.exports = handler;
module.exports.default = handler;
