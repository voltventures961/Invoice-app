# Logo Upload CORS Error - Complete Solution

## The Issue

You're getting this error when uploading logos on Vercel:
```
Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/...' from origin 'https://invoice-app-omega-tan.vercel.app' has been blocked by CORS policy
```

But it worked before with the same settings! Here's why and how to fix it.

## Why It Worked Before But Not Now

Firebase Storage has **implicit CORS rules** that may allow:
- `localhost` domains (for development)
- `*.firebaseapp.com` domains (Firebase hosting)
- `*.web.app` domains (Firebase hosting)

**BUT it doesn't automatically allow custom domains like Vercel!**

The first upload might have worked due to:
1. **Browser cache** - The browser had cached a successful preflight request
2. **Different network** - You were on a different network/ISP
3. **Firebase test mode** - Initial permissive settings
4. **Different browser** - Some browsers handle CORS differently

## The Permanent Solution: Configure CORS

You MUST configure CORS on Firebase Storage to allow your Vercel domain.

### Option 1: Using Google Cloud Console (Web UI - Easiest)

1. **Go to Google Cloud Console:**
   - Open: https://console.cloud.google.com/storage/browser
   - Login with your Firebase Google account
   - Select project: **voltventures-ec8c4**

2. **Find your storage bucket:**
   - You should see: `voltventures-ec8c4.appspot.com`
   - Click on it

3. **Set CORS via Cloud Shell:**
   - Click the **Activate Cloud Shell** button (top right, terminal icon)
   - In the shell, run:

```bash
# Create CORS configuration file
cat > cors.json << 'EOF'
[
  {
    "origin": ["https://invoice-app-omega-tan.vercel.app", "http://localhost:3000", "https://localhost:3000"],
    "method": ["GET", "POST", "PUT", "DELETE", "HEAD"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"]
  }
]
EOF

# Apply CORS configuration
gsutil cors set cors.json gs://voltventures-ec8c4.appspot.com

# Verify it worked
gsutil cors get gs://voltventures-ec8c4.appspot.com
```

### Option 2: Using Local Terminal (Requires Google Cloud SDK)

If you have `gsutil` installed locally:

1. **Create `cors.json` file:**
```json
[
  {
    "origin": ["https://invoice-app-omega-tan.vercel.app", "http://localhost:3000"],
    "method": ["GET", "POST", "PUT", "DELETE", "HEAD"],
    "maxAgeSeconds": 3600,
    "responseHeader": ["Content-Type"]
  }
]
```

2. **Apply it:**
```bash
gcloud auth login
gcloud config set project voltventures-ec8c4
gsutil cors set cors.json gs://voltventures-ec8c4.appspot.com
```

### Option 3: Allow All Origins (Quick Test - NOT for Production!)

**For testing only:**

```json
[
  {
    "origin": ["*"],
    "method": ["GET", "POST", "PUT", "DELETE", "HEAD"],
    "maxAgeSeconds": 3600
  }
]
```

⚠️ **Warning:** This allows ANY website to access your storage. Only for testing!

## Temporary Workaround (While You Fix CORS)

### Workaround 1: Use Base64 Encoding

Instead of uploading to Firebase Storage, store logo as base64 in Firestore:

```javascript
// In SettingsPage.js handleSave function
if (imageFile) {
    // Convert to base64
    const reader = new FileReader();
    reader.readAsDataURL(imageFile);
    reader.onload = async () => {
        const base64Logo = reader.result;

        // Save to Firestore instead of Storage
        const settingsRef = doc(db, 'settings', auth.currentUser.uid);
        await setDoc(settingsRef, {
            companyName,
            companyAddress,
            companyPhone,
            companyVatNumber,
            logoUrl: base64Logo  // Save base64 instead of URL
        }, { merge: true });
    };
}
```

**Pros:**
- ✅ No CORS issues
- ✅ Works immediately

**Cons:**
- ❌ Increases Firestore document size
- ❌ Slower for large images
- ❌ Limited to ~1MB images

### Workaround 2: Upload from Backend (If you have one)

If you add a backend server, upload through it instead of directly from browser.

## After Applying CORS Fix

1. **Clear browser cache:**
   - Chrome: `Ctrl+Shift+Delete` → Clear cached images
   - Or hard refresh: `Ctrl+Shift+R`

2. **Wait 2-5 minutes** for CORS changes to propagate

3. **Test logo upload again**

## Verify CORS Configuration

Check current CORS settings:

```bash
gsutil cors get gs://voltventures-ec8c4.appspot.com
```

Should return your configured origins.

## Why CORS Is Important

CORS (Cross-Origin Resource Sharing) is a security feature that prevents websites from accessing resources on other domains without permission.

**Without CORS configured:**
- ❌ Browser blocks requests from Vercel to Firebase Storage
- ❌ Logo uploads fail with 403/CORS error

**With CORS configured:**
- ✅ Browser allows requests from your Vercel domain
- ✅ Logo uploads work

## Troubleshooting

### Still getting CORS error after configuration?

1. **Check the domain exactly matches:**
   - Use `https://` not `http://`
   - Include or exclude `www.` as needed
   - No trailing slashes

2. **Wait longer:**
   - CORS changes can take up to 10 minutes to propagate

3. **Clear all browser caches:**
   - Clear cache
   - Try incognito/private mode
   - Try different browser

4. **Verify configuration was applied:**
   ```bash
   gsutil cors get gs://voltventures-ec8c4.appspot.com
   ```

5. **Check Firebase Storage Rules:**
   - Make sure rules also allow upload
   - See `FIREBASE_STORAGE_RULES_FIX.md`

### Getting 403 Forbidden (not CORS)?

This is a Storage Rules issue, not CORS. See `FIREBASE_STORAGE_RULES_FIX.md`.

## Quick Summary

**The Real Fix (5 minutes):**
1. Go to Google Cloud Console Cloud Shell
2. Run the 3 commands to create and apply `cors.json`
3. Wait 2-5 minutes
4. Clear browser cache
5. Try uploading logo again

**No access to Cloud Shell?**
- Use the base64 workaround above
- Or ask someone with Google Cloud access to run the commands

## Need Help?

If you're still stuck:
1. Share the output of: `gsutil cors get gs://voltventures-ec8c4.appspot.com`
2. Share the exact error from browser console
3. Confirm your exact Vercel URL

The CORS configuration is the **only** permanent solution for this issue.
