---
name: Driver app API target default
description: Production EAS builds must default to "prod" API target or drivers see the OTP demo login flow instead of email/password.
---

## Rule
In `lib/apiTarget.ts`, always default to `"prod"` when `EXPO_PUBLIC_DOMAIN === "ma.jatek.app"`.

**Why:** Production EAS profiles inject `EXPO_PUBLIC_DOMAIN=ma.jatek.app`. But `getApiTarget()` reads from SecureStore and defaults to `"local"` if nothing is stored. A fresh install hits the OTP demo flow (which is for internal demos only), not the production email/password login. Drivers can't log in.

**How to apply:**
```ts
const IS_PROD_BUILD = process.env.EXPO_PUBLIC_DOMAIN === "ma.jatek.app";
// in getApiTarget():
cached = IS_PROD_BUILD ? "prod" : "local";
```
Same logic applies in `getApiTargetSync()` and in any component that initializes state from the sync accessor.
