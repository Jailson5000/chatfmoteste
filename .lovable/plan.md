

# Fix: WhatsApp Embedded Signup - "Expression is of type asyncfunction, not function"

## Root Cause

The error message is explicit: **"Expression is of type asyncfunction, not function"**. The Facebook SDK validates the callback type and rejects `async` functions.

In `NewWhatsAppCloudDialog.tsx` line 162, the callback passed to `FB.login()` is declared as `async (response: any) => {...}`. The SDK internally checks `typeof callback` and throws because async functions have a different type signature than regular functions.

## Additional Issue

The Meta Developer Console screenshot shows **sessionInfoVersion: 3** and **version: v3**, but the code uses `sessionInfoVersion: 2`. This mismatch could cause the session info listener to not receive the expected data format.

## Changes

**File:** `src/components/connections/NewWhatsAppCloudDialog.tsx`

### Change 1: Remove `async` from FB.login callback (line 162)
- Change `async (response: any) => {` to `(response: any) => {`
- Wrap the async operations inside the callback in a separate `async` function call (using an immediately invoked async function or `.then()` chain)
- This way the callback signature is a regular function (which the SDK accepts), but async operations still work inside

### Change 2: Update sessionInfoVersion to 3 (line 254)
- Change `sessionInfoVersion: 2` to `sessionInfoVersion: 3`
- This matches the configuration shown in the Meta Developer Console

## Technical Detail

```typescript
// BEFORE (broken):
window.FB.login(
  async (response: any) => {
    // ... await calls inside
  },
  { config_id: META_CONFIG_ID, ... }
);

// AFTER (fixed):
window.FB.login(
  (response: any) => {
    // Wrap async work in a non-async callback
    const handleResponse = async () => {
      // ... await calls inside
    };
    handleResponse();
  },
  { config_id: META_CONFIG_ID, ..., extras: { sessionInfoVersion: 3 } }
);
```

## Expected Result

1. `FB.login()` no longer throws "Expression is of type asyncfunction"
2. The popup opens correctly for the Embedded Signup flow
3. Session info version matches the Meta console configuration
