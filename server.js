const express = require('express');
const cors = require('cors');
const { Readable } = require('stream');
const { getClient, resetClient, extractVideoId } = require('./lib/youtube');
const exp = express();

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}
const port = process.env.PORT || 3000;
exp.use(cors());
exp.use(express.static(__dirname + '/src'));

async function fetchVideo(videoId, quality) {
    const youtube = await getClient();
    const info = await youtube.getBasicInfo(videoId);
    const title = (info.basic_info.title || 'video').replace(/[|\\/<>:"?*]/g, '');
    const q = quality === 'high' ? 'best' : 'bestefficiency';
    const stream = await info.download({ type: 'video+audio', quality: q });
    return { title, stream };
}

exp.get('/downloadmp4', async (req, res) => {
    const { URL: videoURL, Quality } = req.query;
    if (!videoURL) return res.status(400).json({ error: 'Missing URL parameter' });

    try {
        const videoId = extractVideoId(videoURL);
        let result;
        try {
            result = await fetchVideo(videoId, Quality);
        } catch (err) {
            resetClient();
            result = await fetchVideo(videoId, Quality);
        }
        res.header('Content-Disposition', `attachment; filename="${result.title}.mp4"`);
        res.header('Content-Type', 'video/mp4');
        Readable.fromWeb(result.stream).pipe(res);
    } catch (err) {
        console.error('Download MP4 error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to download video' });
    }
});

exp.get('/downloadmp3', async (req, res) => {
    const { URL: videoURL } = req.query;
    if (!videoURL) return res.status(400).json({ error: 'Missing URL parameter' });

    try {
        const videoId = extractVideoId(videoURL);
        let result;
        try {
            result = await fetchVideo(videoId);
        } catch (err) {
            resetClient();
            result = await fetchVideo(videoId);
        }
        res.header('Content-Disposition', `attachment; filename="${result.title}.mp3"`);
        res.header('Content-Type', 'audio/mpeg');
        Readable.fromWeb(result.stream).pipe(res);
    } catch (err) {
        console.error('Download MP3 error:', err.message);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to download audio' });
    }
});

exp.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
