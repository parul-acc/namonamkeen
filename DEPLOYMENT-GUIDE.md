# 🚀 Production Deployment Guide - Namo Namkeen

## ✅ Pre-Deployment Checklist

### 1. Code Ready
- [x] All fixes applied
- [x] WhatsApp OTP working locally
- [x] shopConfig with hamperPrice added
- [x] closeWhatsAppLogin() function added
- [x] admin.js duplicate audio removed
- [x] deleteReview function completed
- [x] Service worker cache versions bumped (v14)
- [x] autoFillCheckout() added

### 2. Environment Variables Ready
- [ ] Twilio credentials in `functions/.env`
- [ ] Email credentials in `functions/.env`
- [ ] Razorpay keys in `functions/.env`

---

## 📋 Deployment Steps

### Step 1: Verify .env File

**Location**: `functions/.env`

Ensure it contains:
```env
EMAIL_SENDER=namonamkeens@gmail.com
EMAIL_PASSWORD=mqkr qkbi ribx dgvr
EMAIL_ADMIN=parul19.accenture@gmail.com, namonamkeens@gmail.com

TWILIO_ACCOUNT_SID=your_actual_sid
TWILIO_AUTH_TOKEN=your_actual_token
TWILIO_WHATSAPP_NUMBER=+14155238886

RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret
```

---

### Step 2: Install Dependencies

```bash
cd functions
npm install
```

This ensures `twilio` package is installed.

---

### Step 3: Test Functions Locally (Optional but Recommended)

```bash
# From functions directory
firebase emulators:start --only functions
```

Test the WhatsApp OTP flow one more time with emulator.

---

### Step 4: Deploy Functions FIRST

**IMPORTANT**: Deploy functions before hosting!

```bash
# From root directory (C:\E Drive\Namo Namkeen\Website\)
firebase deploy --only functions
```

**Wait for completion** - Watch for any errors in console.

Expected output:
```
✔ functions: Finished running predeploy script.
✔ functions[sendOrderConfirmation(us-central1)]: Successful
✔ functions[createPaymentOrder(us-central1)]: Successful
✔ functions[sendWhatsAppOTP(us-central1)]: Successful
✔ functions[verifyWhatsAppOTP(us-central1)]: Successful

✔ Deploy complete!
```

---

### Step 5: Deploy Hosting

```bash
firebase deploy --only hosting
```

Expected output:
```
✔ hosting[namo-namkeen-app]: file upload complete
✔ hosting[namo-namkeen-app]: version finalized
✔ hosting[namo-namkeen-app]: release complete

✔ Deploy complete!
```

---

### Step 6: Deploy Everything Together (Alternative)

If you want to deploy both at once:

```bash
firebase deploy
```

---

## 🧪 Post-Deployment Verification

### Test 1: Email Notifications
1. Place a test order on live site
2. Check if confirmation email arrives
3. Verify admin receives BCC copy

### Test 2: WhatsApp OTP Login
1. Go to your live site
2. Click "Login with WhatsApp"
3. Enter your phone number
4. Check WhatsApp for OTP
5. Enter OTP and verify login works
6. ✅ Success: You should be logged in

### Test 3: Hamper Builder
1. Go to hamper section
2. Select 3 products
3. Verify price shows ₹250
4. Add to cart
5. ✅ Success: Hamper in cart at ₹250

### Test 4: Admin Panel
1. Go to admin.html
2. Login as admin
3. Navigate to Reviews section
4. Try deleting a review
5. ✅ Success: Review deletes without error

---

## 🔍 Troubleshooting

### Issue: "Function not found"
**Solution**: Functions deployment failed. Redeploy:
```bash
firebase deploy --only functions --force
```

### Issue: "Permission denied" on createCustomToken
**Solution**: Enable Service Account Token Creator role:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to IAM & Admin > Service Accounts
3. Find Firebase Admin SDK service account
4. Grant "Service Account Token Creator" role

**Or run this command**:
```bash
gcloud projects add-iam-policy-binding namo-namkeen-app \
  --member="serviceAccount:namo-namkeen-app@appspot.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"
```

### Issue: WhatsApp OTP not received
**Check**:
1. Twilio credentials are correct in `.env`
2. Twilio WhatsApp sandbox is approved
3. Your phone number is added to sandbox
4. Check Firebase Functions logs: `firebase functions:log`

### Issue: Cache not updating
**Solution**: Service worker cache version already bumped to v14. Users need to:
- Hard refresh: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac)
- Or wait 24 hours for automatic cache expiry

---

## 📊 Monitor After Deployment

### Firebase Functions Logs
```bash
firebase functions:log
```

Watch for:
- ✅ Successful OTP sends
- ✅ Successful verifications
- ❌ Any errors

### Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select "namo-namkeen-app"
3. Navigate to Functions tab
4. Monitor:
   - Invocations count
   - Error rate
   - Execution time

---

## 💰 Cost Monitoring (Twilio)

**WhatsApp Pricing**:
- ~₹0.35 per message
- 2 messages per login (send + optional resend)
- Monthly cost for 1000 logins: ~₹700

**Check usage**:
- [Twilio Console](https://www.twilio.com/console)
- Navigate to Monitor > Logs
- Filter by WhatsApp messages

---

## 🔒 Security Checklist

- [x] `.env` file is in `.gitignore`
- [x] Never commit credentials to git
- [x] Firebase security rules configured
- [x] Admin access restricted by email whitelist
- [x] OTP expires after 5 minutes
- [x] OTP deleted after verification

---

## 🎯 Quick Deploy Command

For future updates, use this one-liner:

```bash
cd functions && npm install && cd .. && firebase deploy
```

---

## 📝 Rollback Plan

If something goes wrong:

```bash
# View deployment history
firebase hosting:channel:list

# Rollback to previous version
firebase hosting:rollback
```

---

## ✨ Success Criteria

Your deployment is successful when:

- ✅ Website loads without errors
- ✅ WhatsApp OTP login works
- ✅ Email confirmations send
- ✅ Hamper builder shows ₹250
- ✅ Admin review deletion works
- ✅ No console errors in production
- ✅ Firebase Functions logs show successful executions

---

## 🚀 Ready to Deploy!

**Final Command Sequence**:

```bash
# 1. Navigate to project
cd "C:\E Drive\Namo Namkeen\Website"

# 2. Install dependencies
cd functions
npm install
cd ..

# 3. Deploy everything
firebase deploy

# 4. Monitor logs
firebase functions:log --limit 50
```

---

**After deployment, your live site will have**:
- ✅ WhatsApp OTP authentication
- ✅ All security fixes applied
- ✅ Improved UX with auto-fill checkout
- ✅ Fixed hamper pricing
- ✅ Production-ready code

---

**Deployment Time**: ~5-10 minutes  
**Status**: Ready to go live! 🎉
