# TiffinMate

Tiffin subscription management for small kitchens. Early development version.

## Stack
- Expo / React Native (JavaScript), Expo Router
- Node.js + Express REST API
- Neon PostgreSQL

## Getting started
1. Create a Neon PostgreSQL database.
2. Run `server/sql/schema.sql` against the database using Neon's SQL editor.
3. Copy `server/.env.example` to `server/.env`. Set DATABASE_URL and a cryptographically random JWT_SECRET (at least 32 characters). Never commit secrets.
4. In `server/`, run `npm install` then `npm run dev`.
5. Copy `mobile/.env.example` to `mobile/.env`. Set EXPO_PUBLIC_API_URL to your computer's LAN IP and port 4000 (not localhost when testing on a phone).
6. In `mobile/`, run `npm install` then `npx expo start`. Open with Expo Go compatible with the installed SDK.

## Current features
- Provider registration and login with JWT
- Secure token storage on device
- Business-scoped customer listing and creation
- Placeholder meal and payment screens

## Important limitations
- This is an untested development milestone, not production-ready.
- Registration and login endpoints need rate limiting, email verification and password reset before public launch.
- Tokens are long-lived and do not yet support server-side revocation.
- Customer deletion API exists but is not exposed in the UI.
- Billing, subscription scheduling and pause workflows are not yet implemented.
- Database migrations and automated tests are still pending.
