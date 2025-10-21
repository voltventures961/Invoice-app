# Fix Firebase Storage CORS Error

## Problem
Getting CORS error when uploading logo:
```
Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/...' from origin 'https://invoice-app-omega-tan.vercel.app' has been blocked by CORS policy
```

## Why This Happens
Firebase Storage needs to be configured to allow requests from your Vercel domain.

## Solution: Configure CORS for Firebase Storage

### Method 1: Using Google Cloud Console (Recommended)

1. **Install Google Cloud SDK** (if not already installed):
   - Download from: https://cloud.google.com/sdk/docs/install
   - Or use Cloud Shell in Google Cloud Console

2. **Create a CORS configuration file** named `cors.json`:

```json
[
  {
    "origin": ["https://invoice-app-omega-tan.vercel.app", "http://localhost:3000"],
    "method": ["GET", "POST", "PUT", "DELETE"],
    "maxAgeSeconds": 3600
  }
]
```

3. **Apply the CORS configuration**:

```bash
# Login to Google Cloud
gcloud auth login

# Set your project
gcloud config set project voltventures-ec8c4

# Apply CORS configuration
gsutil cors set cors.json gs://voltventures-ec8c4.appspot.com
```

### Method 2: Using Firebase CLI (Alternative)

1. **Install Firebase CLI**:
```bash
npm install -g firebase-tools
```

2. **Login to Firebase**:
```bash
firebase login
```

3. **Create cors.json** file (same as above)

4. **Apply CORS**:
```bash
gsutil cors set cors.json gs://voltventures-ec8c4.appspot.com
```

### Method 3: Allow All Origins (Quick Fix - Less Secure)

If you need a quick fix for development, you can allow all origins:

**cors.json:**
```json
[
  {
    "origin": ["*"],
    "method": ["GET", "POST", "PUT", "DELETE"],
    "maxAgeSeconds": 3600
  }
]
```

Then apply it:
```bash
gsutil cors set cors.json gs://voltventures-ec8c4.appspot.com
```

⚠️ **Warning:** This allows ALL domains to access your storage. Only use for testing.

### Method 4: Via Firebase Console (Easiest but Limited)

Unfortunately, Firebase Console doesn't have a UI for CORS configuration. You must use the command line methods above.

## Verify CORS Configuration

Check your current CORS settings:
```bash
gsutil cors get gs://voltventures-ec8c4.appspot.com
```

## Alternative: Use Firebase Storage Emulator for Local Development

For local development, you can use Firebase emulators which don't have CORS issues:

1. Install emulators:
```bash
firebase init emulators
```

2. Start emulators:
```bash
firebase emulators:start
```

3. Update your config to use emulator in development:
```javascript
if (process.env.NODE_ENV === 'development') {
  connectStorageEmulator(storage, 'localhost', 9199);
}
```

## Quick Fix Summary

**Fastest Solution:**
1. Install Google Cloud SDK
2. Create `cors.json` with your Vercel domain
3. Run: `gsutil cors set cors.json gs://voltventures-ec8c4.appspot.com`
4. Try uploading logo again

## After Fixing CORS

Once CORS is configured:
1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh your app (Ctrl+Shift+R)
3. Try uploading logo again

## Important Notes

- CORS configuration can take a few minutes to propagate
- You may need to clear browser cache after applying changes
- Make sure to include both your production domain (Vercel) and localhost for development
- CORS only affects browser requests, not server-side requests
