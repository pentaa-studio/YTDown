let innertube = null;
let currentClientType = null;
let createdAt = 0;
let evalConfigured = false;
const MAX_AGE_MS = 5 * 60 * 1000;

const DESKTOP_CLIENTS = new Set(['WEB', 'WEB_EMBEDDED_PLAYER', 'MWEB', 'TV', 'TV_EMBEDDED', 'WEB_CREATOR']);

async function ensureEvalShim() {
  if (evalConfigured) return;
  const { Platform } = await import('youtubei.js');
  Platform.shim.eval = async (data, env = {}) => {
    const properties = [];
    if (env.n) {
      properties.push(`n: exportedVars.nFunction(${JSON.stringify(env.n)})`);
    }
    if (env.sig) {
      properties.push(`sig: exportedVars.sigFunction(${JSON.stringify(env.sig)})`);
    }
    const code = `${data.output}\nreturn { ${properties.join(', ')} }`;
    return new Function(code)();
  };
  evalConfigured = true;
}

function createProxyFetch() {
  const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy;
  if (!proxyUrl) return undefined;

  try {
    const { fetch: undiciFetch, ProxyAgent } = require('undici');
    const agent = new ProxyAgent(proxyUrl);
    console.log('[youtube] Using HTTP proxy for Innertube requests');
    return (input, init = {}) => {
      // youtubei.js may pass a Request object; undici needs URL + init with dispatcher
      if (typeof input !== 'string' && input && typeof input.url === 'string') {
        const headers = new Headers(init.headers || input.headers || undefined);
        const method = init.method || input.method || 'GET';
        const body = init.body !== undefined ? init.body : input.body;
        const opts = { ...init, method, headers, dispatcher: agent };
        if (body != null && method !== 'GET' && method !== 'HEAD') {
          opts.body = body;
          opts.duplex = 'half';
        }
        return undiciFetch(input.url, opts);
      }
      return undiciFetch(input, { ...init, dispatcher: agent });
    };
  } catch (e) {
    console.warn('[youtube] Proxy configured but undici not available:', e.message);
    return undefined;
  }
}

function getCookieString() {
  return process.env.YOUTUBE_COOKIE || process.env.COOKIE || undefined;
}

async function getClient(options = {}) {
  await ensureEvalShim();

  const clientType = options.clientType || 'MWEB';
  const deviceCategory = DESKTOP_CLIENTS.has(clientType) ? 'DESKTOP' : 'MOBILE';
  const now = Date.now();
  if (!innertube || currentClientType !== clientType || now - createdAt > MAX_AGE_MS) {
    const { Innertube } = await import('youtubei.js');
    const innertubeOptions = {
      client_type: clientType,
      device_category: deviceCategory,
    };
    const cookie = getCookieString();
    if (cookie) {
      innertubeOptions.cookie = cookie;
      console.log('[youtube] Using YOUTUBE_COOKIE for authenticated session');
    }
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

/** Preferred client order for downloads (MWEB currently has decipherable formats). */
const DOWNLOAD_CLIENT_TYPES = ['MWEB', 'WEB', 'iOS', 'ANDROID', 'WEB_EMBEDDED_PLAYER'];

module.exports = {
  getClient,
  resetClient,
  extractVideoId,
  DOWNLOAD_CLIENT_TYPES,
};
