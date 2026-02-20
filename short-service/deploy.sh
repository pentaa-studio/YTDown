#!/bin/bash
set -e

PROJECT_ID="clip-chronicler-gcp"
REGION="europe-west1"
SERVICE_NAME="ytdown-short"
BUCKET_NAME="clip-chronicler-ytdown-shorts"

echo "=== Deploying YTDown Short Service to Cloud Run ==="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Enable APIs (requires billing to be enabled on project)
echo "[0/4] Enabling APIs..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com storage.googleapis.com --project=$PROJECT_ID

# Create GCS bucket if it doesn't exist
echo "[1/4] Creating GCS bucket..."
gsutil mb -p $PROJECT_ID -l $REGION gs://$BUCKET_NAME 2>/dev/null || true

# Build and push to Artifact Registry
echo "[2/4] Building and pushing container..."
gcloud run deploy $SERVICE_NAME \
  --source . \
  --region $REGION \
  --project $PROJECT_ID \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "GCS_BUCKET=$BUCKET_NAME" \
  --memory 2Gi \
  --cpu 2 \
  --timeout 600 \
  --quiet

echo ""
echo "[4/4] Done! Service URL:"
gcloud run services describe $SERVICE_NAME --region $REGION --project $PROJECT_ID --format='value(status.url)'
