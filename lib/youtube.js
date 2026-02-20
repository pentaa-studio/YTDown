let innertube = null;
let currentClientType = null;
let createdAt = 0;
const MAX_AGE_MS = 5 * 60 * 1000;

async function getClient(options = {}) {
  const clientType = options.clientType || 'ANDROID';
  const deviceCategory = ['WEB', 'WEB_EMBEDDED_PLAYER', 'MWEB'].includes(clientType) ? 'desktop' : 'MOBILE';
  const now = Date.now();
  if (!innertube || currentClientType !== clientType || now - createdAt > MAX_AGE_MS) {
    const { Innertube } = await import('youtubei.js');
    innertube = await Innertube.create({
      client_type: clientType,
      device_category: deviceCategory,
    });
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
