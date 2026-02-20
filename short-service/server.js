const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { Storage } = require('@google-cloud/storage');
const { Innertube } = require('youtubei.js');

const app = express();
app.use(express.json());

const BUCKET_NAME = process.env.GCS_BUCKET || 'clip-chronicler-ytdown-shorts';
const TMP_DIR = '/tmp';

let innertube = null;

async function getYoutubeClient() {
  if (!innertube) {
    innertube = await Innertube.create({
      client_type: 'ANDROID',
      device_category: 'MOBILE',
    });
  }
  return innertube;
}

function extractVideoId(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.slice(1);
    return parsed.searchParams.get('v') || url;
  } catch {
    return url;
  }
}

async function downloadVideo(url) {
  const youtube = await getYoutubeClient();
  const videoId = extractVideoId(url);
  const info = await youtube.getBasicInfo(videoId);
  const stream = await info.download({ type: 'video+audio', quality: 'bestefficiency' });

  const tmpPath = path.join(TMP_DIR, `input-${Date.now()}.mp4`);
  const writeStream = fs.createWriteStream(tmpPath);
  const nodeStream = Readable.fromWeb(stream);
  await pipeline(nodeStream, writeStream);
  return { tmpPath, title: (info.basic_info.title || 'short').replace(/[|\\/<>:"?*]/g, '') };
}

function convertToShort(inputPath, outputPath, options = {}) {
  const { start = 0, duration = 60 } = options;
  const width = 1080;
  const height = 1920;

  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', inputPath,
      '-ss', String(start),
      '-t', String(duration),
      '-vf', `crop=ih*9/16:ih,scale=${width}:${height}`,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      outputPath,
    ];

    const ffmpeg = spawn('ffmpeg', args);
    let stderr = '';

    ffmpeg.stderr.on('data', (d) => { stderr += d.toString(); });

    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-500)}`));
    });

    ffmpeg.on('error', reject);
  });
}

async function uploadToGCS(localPath, destName) {
  const storage = new Storage();
  const bucket = storage.bucket(BUCKET_NAME);
  await bucket.upload(localPath, {
    destination: destName,
    metadata: { contentType: 'video/mp4' },
  });
  const [signedUrl] = await bucket.file(destName).getSignedUrl({
    action: 'read',
    expires: Date.now() + 24 * 60 * 60 * 1000,
  });
  return signedUrl;
}

app.post('/convert', async (req, res) => {
  const { url, start = 0, duration = 60 } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let inputPath;
  let outputPath;
  let title;

  try {
    const info = await downloadVideo(url);
    inputPath = info.tmpPath;
    title = info.title;
    outputPath = path.join(TMP_DIR, `short-${Date.now()}.mp4`);

    await convertToShort(inputPath, outputPath, { start, duration });

    const destName = `shorts/${Date.now()}-${title.slice(0, 50)}.mp4`;
    const downloadUrl = await uploadToGCS(outputPath, destName);

    res.json({ success: true, downloadUrl, title });
  } catch (err) {
    console.error('Convert error:', err);
    res.status(500).json({ error: err.message || 'Conversion failed' });
  } finally {
    [inputPath, outputPath].forEach((p) => {
      if (p && fs.existsSync(p)) fs.unlinkSync(p);
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Short service running on port ${PORT}`);
});
