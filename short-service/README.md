# YTDown Short Service

Cloud Run service that converts YouTube videos to YouTube Shorts format (9:16 vertical, max 60s).

## Prerequisites

1. **Enable billing** on the GCP project `clip-chronicler-gcp`
2. Enable APIs: `gcloud services enable run.googleapis.com storage.googleapis.com --project=clip-chronicler-gcp`

## Deploy

```bash
cd short-service
chmod +x deploy.sh
./deploy.sh
```

## API

### POST /convert

Convert a YouTube video to Short format.

**Body:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "start": 0,
  "duration": 60
}
```

- `url` (required): YouTube video URL
- `start` (optional): Start time in seconds (default: 0)
- `duration` (optional): Max duration in seconds (default: 60)

**Response:**
```json
{
  "success": true,
  "downloadUrl": "https://storage.googleapis.com/...",
  "title": "Video Title"
}
```

The download URL is valid for 24 hours.
