# Jatek Driver

Expo (React Native) mobile app for Jatek delivery drivers. Connects exclusively to the production backend at **https://ma.jatek.app**.

## Stack

- **Framework**: Expo SDK 54 + Expo Router v6 (file-based navigation)
- **Language**: TypeScript
- **State**: TanStack React Query
- **Auth**: JWT via SecureStore (`jatek_driver_token`)
- **Realtime**: SSE (XHR-based `SseClient`) + WebSocket for live GPS
- **Maps**: react-native-maps
- **Location**: expo-location (foreground + background, LOCATION_TASK)
- **Monorepo**: pnpm workspaces

## Where things live

- `artifacts/jatek-driver/` — the entire driver app
- `artifacts/jatek-driver/app/` — Expo Router screens
- `artifacts/jatek-driver/context/` — AuthContext, OnlineContext, ActiveOrderContext
- `artifacts/jatek-driver/lib/api.ts` — all backend API calls
- `artifacts/jatek-driver/lib/apiTarget.ts` — prod/local URL switching (`ma.jatek.app` = prod)
- `artifacts/jatek-driver/services/` — SSE, WebSocket, location tracking
- `artifacts/jatek-driver/components/` — shared UI components

## Backend

Always `https://ma.jatek.app/api` in both dev and prod.

- Dev script hard-codes `EXPO_PUBLIC_DOMAIN=ma.jatek.app`
- `lib/apiTarget.ts` → `IS_PROD_BUILD=true` when `EXPO_PUBLIC_DOMAIN=ma.jatek.app`
- Login screen defaults to `prod` target (email + password)

## CLI

```bash
pnpm --filter @workspace/jatek-driver run dev   # start Expo dev server
pnpm --filter @workspace/jatek-driver run build # EAS bundle build
```

## EAS builds

- `preview` / `production` channels both set `EXPO_PUBLIC_DOMAIN=ma.jatek.app`
- Bundle IDs: `ma.jatek.driver` (iOS + Android)

## User preferences

- Always connect to ma.jatek.app — never localhost — in both dev and prod
- Only jatek-driver exists; no other artifacts in this project
