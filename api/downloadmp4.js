const { Readable } = require('stream');
const { getClient, resetClient, extractVideoId } = require('../lib/youtube');

async function fetchVideo(videoId, quality) {
  const youtube = await getClient();
  const info = await youtube.getBasicInfo(videoId);
  const title = (info.basic_info.title || 'video').replace(/[|\\/<>:"?*]/g, '');

  const q = quality === 'high' ? 'best' : 'bestefficiency';
  const stream = await info.download({ type: 'video+audio', quality: q });

  return { title, stream };
}

module.exports = async (req, res) => {
  const { URL: videoURL, Quality } = req.query;

  if (!videoURL) {
    return res.status(400).json({ error: 'Missing URL parameter' });
  }

  try {
    const videoId = extractVideoId(videoURL);
    let result;

    try {
      result = await fetchVideo(videoId, Quality);
    } catch (err) {
      console.error('MP4 first attempt failed, refreshing client:', err.message);
      resetClient();
      result = await fetchVideo(videoId, Quality);
    }

    res.setHeader('Content-Disposition', `attachment; filename="${result.title}.mp4"`);
    res.setHeader('Content-Type', 'video/mp4');

    Readable.fromWeb(result.stream).pipe(res);
  } catch (err) {
    console.error('Download MP4 error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download video' });
    }
  }
};
