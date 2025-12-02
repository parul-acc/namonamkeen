# Firebase Functions v7 Setup Guide

## Environment Variables Setup

Firebase Functions v7 uses `.env` files and the params module. Here's how to set it up:

### 1. Create `.env` file in `functions/` directory

Create `functions/.env` with:
```env
EMAIL_SENDER=namonamkeens@gmail.com
EMAIL_PASSWORD=mqkr qkbi ribx dgvr
EMAIL_ADMIN=parul19.accenture@gmail.com, namonamkeens@gmail.com
```

**IMPORTANT**: Add `.env` to `.gitignore` to keep secrets safe!

### 2. Add to `.gitignore`

In `functions/.gitignore`, add:
```
.env
.env.*
```

### 3. For Production Deployment

Set environment variables in Firebase console or use:
```bash
firebase deploy --only functions
```

The params module will automatically read from `.env` during deployment.

### 4. Test Locally

Run functions locally:
```bash
cd functions
firebase emulators:start --only functions
```

---

## What Changed

- ✅ **Removed deprecated** `functions.config()`
- ✅ **Added** `defineString()` from params module  
- ✅ **Credentials stored** in `.env` file
- ✅ **Auto-loads** from environment on deployment

---

## Verification

After deployment, test email by:
1. Place a test order
2. Check if email is received
3. Verify no errors in Firebase Functions logs

---

**Status**: ✅ Updated for Firebase Functions v7
