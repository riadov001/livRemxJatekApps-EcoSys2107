---
name: Driver app auth flow
description: How auth state must be updated after login/reset in the Expo driver app — critical for correct navigation.
---

## Rule
After any successful authentication operation (login, OTP verify, password reset), you **must** call `AuthContext.signIn(token)` — not `router.replace("/")` directly.

**Why:** `loginWithCredentials`, `verifyOtp`, and `resetPassword` all call `setToken(token)` which saves the JWT to `expo-secure-store`. But `AuthContext` manages its own in-memory `token` state. If you navigate without calling `signIn()`, `AuthContext.token` stays `null`, `useAuthRouting` sees an unauthenticated state, and immediately redirects back to the login screen. The user can never get in.

**How to apply:**
- `login.tsx`: `const { token } = await loginWithCredentials(...); await signIn(token);`
- `otp.tsx`: `const { token } = await verifyOtp(...); await signIn(token);`
- `reset-password.tsx`: `const result = await resetPassword(...); if (result.token) await signIn(result.token);`
- Do NOT call `router.replace("/")` after auth — `useAuthRouting` in `_layout.tsx` handles navigation automatically once `token` + `user` are set in context.
