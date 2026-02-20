require('dotenv').config();
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { getClient, resetClient, extractVideoId } = require('../lib/youtube');
const { Storage } = require('@google-cloud/storage');

const SHORT_SERVICE_URL = 'https://ytdown-short-791554179661.europe-west1.run.app';
const GCS_BUCKET = 'clip-chronicler-ytdown-shorts';

function getStorage() {
  const opts = {};
  if (process.env.GCP_SA_KEY) {
    try {
      opts.credentials = JSON.parse(process.env.GCP_SA_KEY);
    } catch (e) {
      console.error('Invalid GCP_SA_KEY');
    }
  }
  return new Storage(opts);
}

async function downloadAndUploadToGCS(videoURL) {
  const youtube = await getClient();
  const videoId = extractVideoId(videoURL);
  const info = await youtube.getBasicInfo(videoId);
  const stream = await info.download({ type: 'video+audio', quality: 'bestefficiency' });
  const nodeStream = Readable.fromWeb(stream);

  const gcsPath = `input/${videoId}-${Date.now()}.mp4`;
  const storage = getStorage();
  const bucket = storage.bucket(GCS_BUCKET);
  const file = bucket.file(gcsPath);
  const writeStream = file.createWriteStream({ metadata: { contentType: 'video/mp4' } });

  await pipeline(nodeStream, writeStream);
  return `gs://${GCS_BUCKET}/${gcsPath}`;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, start = 0, duration = 60, stream: wantStream } = req.body || {};

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    let gcsInputPath = null;
    const hasGcsKey = !!process.env.GCP_SA_KEY;

    console.log('[Short] Starting conversion for', url);
    console.log('[Short] GCP_SA_KEY present:', hasGcsKey);

    if (hasGcsKey) {
      console.log('[Short] Downloading from YouTube and uploading to GCS...');
      try {
        gcsInputPath = await downloadAndUploadToGCS(url);
        console.log('[Short] Uploaded to', gcsInputPath);
      } catch (err) {
        console.log('[Short] First attempt failed, retrying:', err.message);
        resetClient();
        gcsInputPath = await downloadAndUploadToGCS(url);
        console.log('[Short] Retry OK, uploaded to', gcsInputPath);
      }
    } else {
      console.log('[Short] No GCP_SA_KEY, Cloud Run will download from YouTube directly');
    }

    const body = gcsInputPath
      ? { gcsInputPath, start, duration, stream: wantStream }
      : { url, start, duration, stream: wantStream };

    console.log('[Short] Calling Cloud Run...');
    const response = await fetch(`${SHORT_SERVICE_URL}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (wantStream) {
      res.setHeader('Content-Type', 'application/x-ndjson');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      if (!response.ok) {
        const data = await response.json();
        res.status(response.status).json(data);
        return;
      }
      const nodeStream = Readable.fromWeb(response.body);
      nodeStream.pipe(res);
      return;
    }

    const data = await response.json();
    if (!response.ok) {
      console.error('[Short] Cloud Run error:', response.status, data);
      const msg = (data.error || '').toLowerCase();
      if (response.status === 500 && (msg.includes('login') || msg.includes('required'))) {
        return res.status(500).json({
          error: data.error,
          hint: !hasGcsKey
            ? 'Set GCP_SA_KEY in Vercel env vars so the video is downloaded on Vercel and uploaded to GCS.'
            : undefined,
        });
      }
      return res.status(response.status).json(data);
    }
    console.log('[Short] Done:', data.title);
    res.json(data);
  } catch (err) {
    console.error('[Short] Error:', err.message);
    res.status(500).json({ error: err.message || 'Conversion failed' });
  }
};
