# Cloud Run Deploy

LingT should be deployed on Google Cloud Run for Vibe2Ship.

## 1. One-time setup

```powershell
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
gcloud artifacts repositories create lingt --repository-format=docker --location=asia-south1
```

## 2. Build image with public Firebase config

These values are safe to pass as build args because `NEXT_PUBLIC_*` variables are included in the browser bundle.

```powershell
gcloud builds submit `
  --config cloudbuild.yaml `
  --substitutions _REGION=asia-south1,_SERVICE=lingt,_ARTIFACT_REPO=lingt,_NEXT_PUBLIC_FIREBASE_API_KEY="...",_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="...",_NEXT_PUBLIC_FIREBASE_PROJECT_ID="...",_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="...",_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="...",_NEXT_PUBLIC_FIREBASE_APP_ID="...",_NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID="...",_NEXT_PUBLIC_FIREBASE_VAPID_KEY="..."
```

## 3. Deploy image to Cloud Run

Use the image tag printed by Cloud Build.

```powershell
gcloud run deploy lingt `
  --image asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/lingt/lingt:SHORT_SHA `
  --region asia-south1 `
  --allow-unauthenticated `
  --port 8080 `
  --set-env-vars APP_URL="https://YOUR_CLOUD_RUN_URL",GOOGLE_REDIRECT_URI="https://YOUR_CLOUD_RUN_URL/api/integrations/google/callback",GMAIL_WEBHOOK_SECRET="..." `
  --set-env-vars GEMINI_API_KEY="...",GOOGLE_CLIENT_ID="...",GOOGLE_CLIENT_SECRET="..." `
  --set-env-vars FIREBASE_ADMIN_PROJECT_ID="...",FIREBASE_ADMIN_CLIENT_EMAIL="..." `
  --set-env-vars FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

## 4. Update Google OAuth

Add this redirect URI to the Google Cloud OAuth web client:

```txt
https://YOUR_CLOUD_RUN_URL/api/integrations/google/callback
```

## 5. Update Apps Script

Set the Gmail trigger webhook URL to:

```txt
https://YOUR_CLOUD_RUN_URL/api/gmail/webhook
```

Use the same `GMAIL_WEBHOOK_SECRET` value in the `x-lingt-webhook-secret` header.

## 6. Live smoke tests

- Open `/`
- Sign in
- Open `/integrations`
- Reconnect Google
- Send a chat message
- Add generated tasks to Workspace
- Paste meeting notes into Workspace and approve one action
- Send a test Apps Script payload to `/api/gmail/webhook`
