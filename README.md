# TiffinMate

Tiffin subscription management for small kitchens. Early development version.

## Stack
- Expo / React Native (JavaScript), Expo Router
- Node.js + Express REST API
- Neon PostgreSQL

## Getting started
1. Neon project **TiffinMate** has been created (project ID: `dawn-sky-89691216`, region: Singapore).
2. The base schema has already been applied to the TiffinMate Neon database.
3. The meal plan migration has already been applied. For a new database, run both SQL files in order.
4. Copy `server/.env.example` to `server/.env`. Set DATABASE_URL and a cryptographically random JWT_SECRET (at least 32 characters). Never commit secrets.
5. In `server/`, run `npm install` then `npm run dev`.
6. Copy `mobile/.env.example` to `mobile/.env`. Set EXPO_PUBLIC_API_URL to your computer's LAN IP and port 4000 (not localhost when testing on a phone).
7. In `mobile/`, run `npm install` then `npx expo start`. Open with Expo Go compatible with the installed SDK.

## Current features
- Provider registration and login with JWT
- Secure token storage on device
- Business-scoped customer listing and creation
- Meal plans, subscription creation and live kitchen portion estimates
- Placeholder payment screen

## Important limitations
- This is an untested development milestone, not production-ready.
- Registration and login endpoints need rate limiting, email verification and password reset before public launch.
- Tokens are long-lived and do not yet support server-side revocation.
- Customer deletion API exists but is not exposed in the UI.
- Billing, pause approval and meal delivery confirmation are not yet implemented.
- Kitchen counts reflect currently active subscriptions, not generated meal entries.
- Duplicate or overlapping subscriptions need stronger business rules before production use.
- Database migrations and automated tests are still pending.
