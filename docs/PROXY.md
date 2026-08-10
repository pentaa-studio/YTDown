# Proxy Setup (Production)

YouTube blocks requests from datacenter IPs (Vercel, AWS, etc.). Downloads work locally (residential IP) but fail in production with "Video is login required" or similar.

## Solution: Residential Proxy

Route YouTube requests through a residential proxy so they appear to come from a real user.

### 1. Get a proxy

Use a residential proxy provider:
- [Bright Data](https://brightdata.com) – free trial
- [ScraperAPI](https://www.scraperapi.com) – 5000 free requests
- [Oxylabs](https://oxylabs.io), [Smartproxy](https://smartproxy.com), etc.

### 2. Configure on Vercel

Add the proxy URL as an environment variable:

- **Name**: `HTTP_PROXY` or `HTTPS_PROXY`
- **Value**: `http://user:pass@host:port` (format depends on provider)
- **Environment**: Production (and Preview if needed)

Example for Bright Data:
```
HTTP_PROXY=http://user-xxx:pass@brd.superproxy.io:22225
```

### 3. Redeploy

Redeploy the project for the env var to take effect.

---

**Note**: Proxies are usually paid after the trial. Without a proxy, downloads will fail in production for most videos.
