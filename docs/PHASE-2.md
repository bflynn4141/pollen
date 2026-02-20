# Phase 2: World ID Verification

> **Goal:** Sybil resistance so we can pay real humans, not bots.
>
> **Duration:** 3-5 days
>
> **Gate:** World ID verification working end-to-end
>
> **Depends on:** Phase 1 (API running, contributors uploading)

## Why Just World ID

At 10-100 contributors, we don't need on-chain Merkle proofs, Dune dashboards, or inclusion proofs. We need one thing: **proof that each contributor is a unique human** so payouts can't be gamed.

Everything else (on-chain audit, public dashboards, deletion flows) gets added when scale demands it — likely when an enterprise buyer asks "how do I know this data is real?"

## What We're Building

```
npx pollen init (updated flow)
  │
  ├─ Step 1: Create keypair + config (existing)
  ├─ Step 2: Link wallet for payouts (existing)
  │
  ├─ Step 3 (NEW): Verify with World ID
  │   └─ Opens browser → World ID widget (IDKit)
  │       └─ Device verification (phone-based)
  │           └─ Returns: nullifier_hash + ZK proof
  │
  ├─ Step 4: Send proof to Pollen API
  │   └─ Server verifies against World ID contract
  │       └─ Stores nullifier (prevents re-registration)
  │
  └─ Done. Contributor status: "verified"
```

## Implementation

### Client Side (`packages/cli/src/worldid.ts`)

- Open a local HTTP server on a random port (localhost callback)
- Launch browser to a hosted verification page (or inline IDKit widget)
- IDKit handles the World ID flow (Device verification)
- Callback receives: `{ merkle_root, nullifier_hash, proof }`
- Send to Pollen API for server-side verification

**Config:** `~/.pollen/config.json` gets a `verification` block:
```json
{
  "verification": {
    "method": "world_id_device",
    "nullifier_hash": "0x...",
    "verified_at": "2026-02-25T10:00:00Z"
  }
}
```

### Server Side (`packages/api/src/worldid.ts`)

**New endpoint:**
```
POST /v1/contributor/verify
  Body: { merkle_root, nullifier_hash, proof, wallet_address }
  Validation:
    1. Verify ZK proof against World ID on-chain verifier (Base)
    2. Check nullifier_hash not already in contributors table
    3. Update contributor status to "verified"
  Response: { verified: true }
```

**World ID setup:**
- Register app on Worldcoin Developer Portal
- App ID + Action ID configured in wrangler.toml secrets
- Verification via World ID's on-chain contract (Base) or cloud API

### Schema Changes

```sql
ALTER TABLE contributors ADD COLUMN world_id_nullifier TEXT UNIQUE;
ALTER TABLE contributors ADD COLUMN verified_at INTEGER;
ALTER TABLE contributors ADD COLUMN verification_method TEXT;
```

### Contributor Status Gates

- **Unverified:** Can upload contributions (stored normally), cannot earn payouts
- **Verified:** Full access, earns payouts when Phase 4 launches
- Nudge unverified contributors: "Verify with World ID to start earning"

## What's Deferred to Later

| Component | When to Add |
|-----------|-------------|
| On-chain Merkle audit | When an enterprise buyer asks for data provenance |
| Inclusion proofs | When contributors ask "how do I know my data was counted?" |
| Dune dashboard | When we want a public marketing page |
| GDPR deletion flow | Before any EU launch or when contributor count > 500 |

## Success Criteria

- [ ] World ID widget opens in browser from `npx pollen init`
- [ ] ZK proof verifies correctly on server
- [ ] Duplicate nullifier rejected (can't verify twice)
- [ ] Contributor status shows "verified" after flow
- [ ] Unverified contributors can still upload (just can't earn yet)
- [ ] Total time: < 60 seconds from `pollen init` to verified
