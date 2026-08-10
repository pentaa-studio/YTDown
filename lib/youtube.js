let innertube = null;
let currentClientType = null;
let createdAt = 0;
const MAX_AGE_MS = 5 * 60 * 1000;

function createProxyFetch() {
  const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy;
  if (!proxyUrl) return undefined;

  try {
    const { fetch: undiciFetch, ProxyAgent } = require('undici');
    const agent = new ProxyAgent(proxyUrl);
    return (input, init = {}) => undiciFetch(input, { ...init, dispatcher: agent });
  } catch (e) {
    console.warn('[youtube] Proxy configured but undici not available:', e.message);
    return undefined;
  }
}

async function getClient(options = {}) {
  const clientType = options.clientType || 'ANDROID';
  const deviceCategory = ['WEB', 'WEB_EMBEDDED_PLAYER', 'MWEB'].includes(clientType) ? 'desktop' : 'MOBILE';
  const now = Date.now();
  if (!innertube || currentClientType !== clientType || now - createdAt > MAX_AGE_MS) {
    const { Innertube } = await import('youtubei.js');
    const innertubeOptions = {
      client_type: clientType,
      device_category: deviceCategory,
    };
    const proxyFetch = createProxyFetch();
    if (proxyFetch) {
      innertubeOptions.fetch = proxyFetch;
    }
    innertube = await Innertube.create(innertubeOptions);
    currentClientType = clientType;
    createdAt = now;
  }
  return innertube;
}

function resetClient() {
  innertube = null;
  currentClientType = null;
  createdAt = 0;
}

function extractVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.slice(1);
    }
    return parsed.searchParams.get('v') || url;
  } catch {
    return url;
  }
}

module.exports = { getClient, resetClient, extractVideoId };
