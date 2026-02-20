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

async function downloadVideo(url, onProgress) {
  const emit = (p) => onProgress && onProgress(p);
  emit(5);
  const youtube = await getYoutubeClient();
  const videoId = extractVideoId(url);
  const info = await youtube.getBasicInfo(videoId);
  emit(10);
  const stream = await info.download({ type: 'video+audio', quality: 'bestefficiency' });

  const tmpPath = path.join(TMP_DIR, `input-${Date.now()}.mp4`);
  const writeStream = fs.createWriteStream(tmpPath);
  const nodeStream = Readable.fromWeb(stream);
  await pipeline(nodeStream, writeStream);
  emit(30);
  return { tmpPath, title: (info.basic_info.title || 'short').replace(/[|\\/<>:"?*]/g, '') };
}

function convertToShort(inputPath, outputPath, options = {}) {
  const { start = 0, duration = 60, onProgress } = options;
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
    let lastProgress = 30;

    ffmpeg.stderr.on('data', (d) => {
      stderr += d.toString();
      const m = stderr.match(/time=(\d+):(\d+):(\d+)/g);
      if (m && m.length) {
        const last = m[m.length - 1];
        const [, h, min, sec] = last.match(/time=(\d+):(\d+):(\d+)/) || [];
        const elapsed = (parseInt(h) || 0) * 3600 + (parseInt(min) || 0) * 60 + parseInt(sec) || 0;
        const p = Math.min(85, 30 + (elapsed / duration) * 55);
        if (p > lastProgress + 2) {
          lastProgress = p;
          onProgress && onProgress(Math.round(p));
        }
      }
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) {
        onProgress && onProgress(85);
        resolve();
      } else reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-500)}`));
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
    version: 'v4',
  });
  return signedUrl;
}

function emitProgress(res, data) {
  res.write(JSON.stringify(data) + '\n');
}

async function downloadFromGCS(gcsPath, onProgress) {
  const emit = (p) => onProgress && onProgress(p);
  emit(5);
  const storage = new Storage();
  const [bucketName, ...pathParts] = gcsPath.replace('gs://', '').split('/');
  const filePath = pathParts.join('/');
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(filePath);
  const tmpPath = path.join(TMP_DIR, `input-${Date.now()}.mp4`);
  await file.download({ destination: tmpPath });
  emit(30);
  const title = path.basename(filePath, '.mp4').replace(/[|\\/<>:"?*]/g, '');
  return { tmpPath, title: title || 'short' };
}

app.post('/convert', async (req, res) => {
  const { url, gcsInputPath, start = 0, duration = 60, stream: wantStream } = req.body;

  if (!url && !gcsInputPath) {
    return res.status(400).json({ error: 'Missing url or gcsInputPath parameter' });
  }

  let inputPath;
  let outputPath;
  let title;

  const onProgress = wantStream ? (p) => emitProgress(res, { progress: p }) : null;

  if (wantStream) {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  }

  try {
    let info;
    if (gcsInputPath) {
      console.log('[Short] Downloading from GCS:', gcsInputPath);
      info = await downloadFromGCS(gcsInputPath, onProgress);
    } else {
      console.log('[Short] Downloading from YouTube:', url);
      info = await downloadVideo(url, onProgress);
    }
    inputPath = info.tmpPath;
    title = info.title;
    outputPath = path.join(TMP_DIR, `short-${Date.now()}.mp4`);

    console.log('[Short] Converting with FFmpeg...');
    await convertToShort(inputPath, outputPath, { start, duration, onProgress });

    console.log('[Short] Uploading result to GCS...');
    if (onProgress) emitProgress(res, { progress: 90 });
    const destName = `shorts/${Date.now()}-${title.slice(0, 50)}.mp4`;
    const downloadUrl = await uploadToGCS(outputPath, destName);
    if (onProgress) emitProgress(res, { progress: 100 });

    if (gcsInputPath) {
      const storage = new Storage();
      const [bucketName, ...pathParts] = gcsInputPath.replace('gs://', '').split('/');
      try {
        await storage.bucket(bucketName).file(pathParts.join('/')).delete();
      } catch (e) { /* ignore */ }
    }

    console.log('[Short] Done:', title);
    if (wantStream) {
      emitProgress(res, { success: true, downloadUrl, title });
      res.end();
    } else {
      res.json({ success: true, downloadUrl, title });
    }
  } catch (err) {
    console.error('[Short] Convert error:', err.message, err.stack);
    if (wantStream) {
      emitProgress(res, { error: err.message });
      res.end();
    } else {
      res.status(500).json({ error: err.message || 'Conversion failed' });
    }
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
