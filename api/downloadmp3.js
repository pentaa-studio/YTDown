const { Readable } = require('stream');
const { getClient, resetClient, extractVideoId } = require('../lib/youtube');

async function fetchAudio(videoId, clientType = 'ANDROID') {
  const youtube = await getClient({ clientType });
  const info = await youtube.getBasicInfo(videoId);
  const title = (info.basic_info.title || 'audio').replace(/[|\\/<>:"?*]/g, '');
  const stream = await info.download({ type: 'video+audio', quality: 'bestefficiency' });
  return { title, stream };
}

module.exports = async (req, res) => {
  const { URL: videoURL } = req.query;

  if (!videoURL) {
    return res.status(400).json({ error: 'Missing URL parameter' });
  }

  try {
    const videoId = extractVideoId(videoURL);
    let result;
    const clientTypes = ['ANDROID', 'WEB', 'WEB_EMBEDDED_PLAYER'];

    for (const clientType of clientTypes) {
      try {
        resetClient();
        result = await fetchAudio(videoId, clientType);
        break;
      } catch (err) {
        console.error('MP3', clientType, 'failed:', err.message);
        if (clientType === clientTypes[clientTypes.length - 1]) throw err;
      }
    }

    res.setHeader('Content-Disposition', `attachment; filename="${result.title}.mp3"`);
    res.setHeader('Content-Type', 'audio/mpeg');

    Readable.fromWeb(result.stream).pipe(res);
  } catch (err) {
    console.error('Download MP3 error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download audio' });
    }
  }
};
