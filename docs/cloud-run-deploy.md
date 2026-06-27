# Cloud Run Deploy

LingT should be deployed on Google Cloud Run for Vibe2Ship.

## 1. One-time setup

```powershell
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

## 2. Cloud Build trigger substitutions

Use the Cloud Run GitHub trigger with `cloudbuild.yaml`. Keep the generated Cloud Run substitutions, then add these Firebase public build substitutions. These values are safe to pass as build args because `NEXT_PUBLIC_*` variables are included in the browser bundle.

```txt
_NEXT_PUBLIC_FIREBASE_API_KEY=...
_NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
_NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
_NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
_NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
_NEXT_PUBLIC_FIREBASE_APP_ID=...
_NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...
_NEXT_PUBLIC_FIREBASE_VAPID_KEY=...
```

## 3. Runtime environment variables

Set these in Cloud Run under Variables & Secrets. These are read by the running server, not baked into the browser bundle.

```txt
APP_URL=https://YOUR_CLOUD_RUN_URL
NEXT_PUBLIC_APP_URL=https://YOUR_CLOUD_RUN_URL
GOOGLE_REDIRECT_URI=https://YOUR_CLOUD_RUN_URL/api/integrations/google/callback
GOOGLE_API_KEY=...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.5-flash
GOOGLE_PLATFORM_TYPE=gcp
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_OAUTH_STATE_SECRET=...
FIREBASE_ADMIN_PROJECT_ID=...
FIREBASE_ADMIN_CLIENT_EMAIL=...
FIREBASE_ADMIN_PRIVATE_KEY=...
GMAIL_WEBHOOK_SECRET=...
LINGT_AUTOMATION_SECRET=...
REMINDER_CRON_SECRET=...
LINGT_AUTOCOMMIT_CALENDAR=false
```

## 4. Update Google OAuth

Add this redirect URI to the Google Cloud OAuth web client:

```txt
https://YOUR_CLOUD_RUN_URL/api/integrations/google/callback
```

## 5. Optional background Gmail scan

LingT scans Gmail directly through the connected Google OAuth account. To run it in the background on Google Cloud, create a Cloud Scheduler job:

```powershell
gcloud scheduler jobs create http lingt-gmail-sync `
  --location=asia-south1 `
  --schedule="*/10 * * * *" `
  --uri="https://YOUR_CLOUD_RUN_URL/api/gmail/sync" `
  --http-method=POST `
  --headers="Content-Type=application/json,x-lingt-automation-secret=YOUR_LINGT_AUTOMATION_SECRET" `
  --message-body="{\"all\":true,\"limit\":10}"
```

The app also scans once when a connected user opens Integrations.

## 6. Live smoke tests

- Open `/`
- Sign in
- Open `/integrations`
- Reconnect Google
- Send a chat message
- Add generated tasks to Workspace
- Paste meeting notes into Workspace and approve one action
- Run Gmail scan from `/integrations`
