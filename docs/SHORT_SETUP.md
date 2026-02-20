# Short Conversion Setup

For videos that require login (e.g. "Video is login required"), the download happens on **Vercel** (same as MP4) then the file is sent to Cloud Run for conversion. This requires GCP credentials on Vercel.

## 1. Create a service account key

```bash
gcloud iam service-accounts keys create key.json \
  --iam-account=791554179661-compute@developer.gserviceaccount.com \
  --project=clip-chronicler-gcp
```

## 2. Add to Vercel

1. Copy the contents of `key.json`
2. In Vercel: Project → Settings → Environment Variables
3. Add `GCP_SA_KEY` = (paste the JSON content)

## 3. Redeploy

Redeploy the project for the env var to take effect.

---

Without `GCP_SA_KEY`, the Short conversion falls back to Cloud Run downloading from YouTube directly (may fail for "login required" videos).
