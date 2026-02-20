let innertube = null;
let createdAt = 0;
const MAX_AGE_MS = 5 * 60 * 1000;

async function getClient() {
  const now = Date.now();
  if (!innertube || now - createdAt > MAX_AGE_MS) {
    const { Innertube } = await import('youtubei.js');
    innertube = await Innertube.create({
      client_type: 'ANDROID',
      device_category: 'MOBILE',
    });
    createdAt = now;
  }
  return innertube;
}

function resetClient() {
  innertube = null;
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
