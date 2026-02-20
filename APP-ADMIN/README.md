# CERTIFY Admin Dashboard

Admin dashboard for managing CERTIFY app tenants, subscriptions, and users.

**⚠️ PRIVATE - For admin use only**

## Setup

1. Copy `.env.example` to `.env` and fill in Supabase credentials
2. Install dependencies: `npm install`
3. Run dev server: `npm run dev`
4. Build Android APK: `npm run android:build`

## Features

- View all tenants and their subscription status
- Quick actions: Extend subscription, Lock/Unlock, Reset password
- View tenant details, users, devices, billing history
- Admin-only access (hardcoded email check)

## Build

- **Web**: `npm run build`
- **Android APK**: `npm run android:build`
- APK saved to `releases/CERTIFY-ADMIN-v1.0.0.apk`
