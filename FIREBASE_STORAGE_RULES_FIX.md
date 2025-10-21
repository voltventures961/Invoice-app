# Fix Firebase Storage Rules for Logo Uploads

## Problem
Users getting "403 Forbidden" error when uploading company logos:
```
Firebase Storage: User does not have permission to access 'logos/...'
```

## Solution
You need to update your Firebase Storage security rules to allow authenticated users to upload logos to their own folder.

## Steps to Fix

### 1. Go to Firebase Console
1. Open [Firebase Console](https://console.firebase.google.com)
2. Select your project: **voltventures-ec8c4**
3. Click **Storage** in the left sidebar
4. Click the **Rules** tab at the top

### 2. Update Storage Rules

Replace your current rules with these:

```javascript
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    // Allow users to read/write their own logos
    match /logos/{userId}/{allPaths=**} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId
                   && request.resource.size < 5 * 1024 * 1024  // Max 5MB
                   && request.resource.contentType.matches('image/.*');  // Only images
    }

    // Deny all other access by default
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

### 3. Click "Publish"

Click the **Publish** button to save the new rules.

## What These Rules Do

✅ **Allow each user to:**
- Upload images to their own folder: `logos/{their-userId}/`
- Read images from their own folder
- Only upload files under 5MB
- Only upload image files (PNG, JPG, GIF, etc.)

❌ **Prevent users from:**
- Accessing other users' logos
- Uploading non-image files
- Uploading files over 5MB

## Test the Fix

1. Go to your app's Settings page
2. Try uploading a company logo
3. Should work without the 403 error

## Alternative (More Permissive - If Logos Need to be Public)

If you want company logos to be publicly readable (e.g., for sharing invoices with clients), use these rules instead:

```javascript
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    // Allow users to upload to their own folder, anyone can read
    match /logos/{userId}/{allPaths=**} {
      allow read: if true;  // Anyone can read (for public invoice PDFs)
      allow write: if request.auth != null && request.auth.uid == userId
                   && request.resource.size < 5 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }

    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

This allows:
- ✅ Public read access (useful if you send invoices with logos to clients)
- ✅ Only owner can upload/modify
- ✅ Still protected from unauthorized uploads

## Current Rules (What You Probably Have)

Your current rules are likely:
```javascript
// Default rules - blocks everything after testing period
allow read, write: if false;
```

OR

```javascript
// Old test mode - allows everything (INSECURE)
allow read, write: if true;
```

Both need to be replaced with the secure user-specific rules above.

## Quick Fix Summary

**Firebase Console → Storage → Rules → Paste rules above → Publish**

That's it! The logo upload should work after publishing the new rules.
