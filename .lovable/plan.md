
# Fix: QR Code Connection Failing on Evolution API v2.3.1

## Problem Identified

The `get_qrcode` action in the `evolution-api` edge function has an overly aggressive "corrupted session recovery" system with 3 levels of retries (Level 1: 3 retries x 5s, Level 2: logout + 2 retries x 5s, Level 3: delete + recreate + 2 retries x 5s). Total execution time exceeds ~70 seconds, which hits the edge function timeout limit (~60s).

Additionally, the version compatibility check on line 1516 only whitelists v2.3.3 and v2.3.5, incorrectly flagging v2.3.1 as "incompatible".

The real issue: after a fresh Evolution API restart (DB wiped), Baileys v7 needs extra time to initialize WebSocket sessions. The `/instance/connect` endpoint returns `{count:0}` during this period. Instead of waiting patiently, the code cascades through destructive recovery levels (logout, delete+recreate), making things worse.

## Solution

Simplify the corrupted session recovery to be fast and non-destructive:

### Changes to `supabase/functions/evolution-api/index.ts`

1. **Replace the 3-level recovery cascade (lines ~1241-1516)** with a simpler approach:
   - Level 1: Try `/instance/connect` 3 times with 3-second delays (total ~12s)
   - If still no QR and state is "connecting", return a **retryable response** (not an error) telling the frontend to poll again
   - Level 2 (only if state is NOT "connecting"): Single logout + connect attempt
   - Remove Level 3 entirely (delete+recreate is too destructive for a timing issue)

2. **Fix version compatibility check (line 1516)**: Add v2.3.1 to the list of compatible versions, or better, remove the version-specific check entirely since the recovery logic will be simpler and version-agnostic.

3. **Reduce recovery timeouts**: Each retry should use 8-second timeout max (not 10-15s), and delays between retries should be 3s (not 5s). This keeps total execution under 40 seconds.

### Technical Details

The key insight is that `{count:0}` from `/instance/connect` is NOT a corrupted session -- it's Baileys still initializing. The frontend already has polling logic (pollCount/maxPolls shown in QRCodeDialog). We should let the frontend handle the retry timing instead of blocking the edge function for 70+ seconds.

**New recovery flow:**

```text
/instance/connect returns {count:0}
   |
   +-> Check connectionState
   |     |
   |     +-> "open"/"connected" -> Return success
   |     +-> "connecting" -> Return {retryable: true} immediately
   |     +-> other state -> Continue to Level 1
   |
   +-> Level 1: 3x connect attempts (3s delay each, ~12s total)
   |     |
   |     +-> QR found -> Return success
   |     +-> No QR -> Continue
   |
   +-> Level 2: Logout + 2x connect (3s delay, ~10s total)
   |     |
   |     +-> QR found -> Return success
   |     +-> No QR -> Return {retryable: true, error: "Aguarde..."}
   |
   (No Level 3 - no delete/recreate)
```

This keeps total execution under ~30 seconds and lets the client retry via its polling mechanism.
