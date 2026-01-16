import pkg from '../../package.json';

const FALLBACK_CACHE_VERSION = 'v1';

export const CACHE_VERSION = String(
  process.env.NEXT_PUBLIC_CACHE_VERSION || pkg.version || FALLBACK_CACHE_VERSION,
);
