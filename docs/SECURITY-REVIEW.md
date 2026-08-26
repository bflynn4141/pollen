# Pollen security review

Review date: 2026-08-26

## Scope and method

This repository review covers PollenTokenV2, PollenSettlementV2, the future PollenSettlementV3 and PollenActiveRevenueVault, the x402 relayer, active-revenue allocation and Merkle logic, contribution ingestion, privacy rollups, admin routes, weekly payout automation, roles, key custody assumptions, deployment records, and monitoring. It is not an independent smart-contract audit or penetration test.

## Deployed Base state observed

- PollenTokenV2: `0x8ED2E55875Bf4C3082364441FfD314Ec6E228318`
- PollenSettlementV2: `0x4548475CA9EE1BEff99fFfa3b691815388B1E139`
- Base USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Total POLLEN supply: 55,000
- Initial balances: 50,000 and 5,000 POLLEN to the two migration recipients in the deployment record
- Token USDC balance: 0
- Settlement USDC balance: 0
- `accRevenuePerShare`: 0
- Deployment-record admin has `DEFAULT_ADMIN_ROLE`: true
- Deployment-record minter has `MINTER_ROLE`: true

The initial supply is concentrated 90.91% and 9.09% across two addresses. Under the current contract, that concentration also controls the split of initial USDC revenue unless tokens move or new weekly POLLEN is minted. This is an economic disclosure requirement, not evidence of an exploit.

PollenSettlementV3 and PollenActiveRevenueVault have no deployed address. No production value, role, settlement, root, or claim has been created for V3.

## Controls verified in code and tests

- PollenTokenV2 uses OpenZeppelin ERC20, AccessControl, and SafeERC20.
- Migration mints are capped at 55,000 POLLEN.
- Weekly `mintBatch` is minter-only, just-closed-epoch-only, and capped by `epochPool`.
- Revenue accounting settles balances before transfers and refreshes debt after balance changes.
- PollenSettlementV2 sends 100% of a settled payment into PollenTokenV2 revenue accounting.
- x402 requirements bind exact amount, Base CAIP-2 network, USDC asset, and settlement recipient.
- The relayer rejects legacy v1 and non-65-byte smart-wallet signatures.
- Durable Object reservations protect authorization nonces and prevent concurrent reuse.
- Failed and empty protected responses release the reservation and do not settle.
- Contribution ingestion accepts only the closed receipt schema and rejects unknown fields.
- Public cells require five distinct contributors before publication.
- Payouts require five eligible contributors, persist in-flight proposal IDs, and fail closed on missing score rows.
- Admin routes require a bearer secret and use uncached responses.
- The V3 planner uses exactly four closed score epochs, explicit integer recency weights, an exact archive-block POLLEN snapshot, square-root balance weighting, a 10% wallet cap, and deterministic largest-remainder dust.
- Duplicate contributor IDs, World ID nullifiers, wallets, and score epochs fail closed before a root is created.
- Public V3 artifacts omit contributor IDs and World ID nullifiers while retaining a protected-source digest.
- The TypeScript and Solidity Merkle implementations share a fixed claim vector.
- V3 vault roots are immutable per epoch, reserved revenue cannot be allocated twice, claim indices cannot replay, relayers cannot redirect payment, and expired unclaimed value returns to carry.
- V3 deposit, publish, and pause powers use separate roles. Claims and deposits use reentrancy protection and SafeERC20.
- Stateful Forge invariants check that reserved revenue never exceeds the vault balance, available plus reserved equals the vault balance, and deposited USDC remains in the vault or proved recipient wallets.

Repository verification includes JavaScript regression suites, Forge tests, type checks, build, Wrangler dry-run, workflow syntax checks, and an official x402 v2 client handshake test.

The production dependency audit initially reported 53 advisories. Next.js was
updated to 15.5.24 and patched transitive versions were pinned for Rollup,
Vite, Picomatch, path-to-regexp, PostCSS, Lodash, js-yaml, nanoid, Sharp, and
esbuild. Tests and the production build pass after the update. Two high
advisories remain in `image-size@2.0.2`, a Fumadocs build dependency for which
the registry advisory lists no patched version.

## Findings and launch actions

### High: production admin credentials are out of sync

Repeated health runs returned HTTP 401. GitHub's `WORKER_ADMIN_SECRET` predates a Worker `ADMIN_SECRET` change. This prevents health verification and authorized recovery.

Action: with explicit production approval, rotate both locations to one new random value, confirm neither value appears in logs, and rerun health. Never copy the secret into an issue or runbook.

### High: epoch-close schedule was one day early

The numeric Cloudflare weekday fired Monday rather than Tuesday. Repository configuration now uses `TUE`, but the repair is not active until deployment. The last observed invocation also threw, so a backfill or scheduled execution must be observed for any second runtime failure.

Action: deploy with approval, invoke the protected backfill for the still-payable just-closed epoch if valid, inspect the response, and dry-run payout before any mint.

### High: no independent V2 or V3 contract audit is evidenced

The contracts have focused Forge regression, fuzz, cross-language proof, and V3 invariant coverage, including revenue-accounting bugs fixed from v1, but no independent audit report is present. V3 also adds a privileged Merkle-root publisher and a vault that may hold buyer revenue.

Action: obtain external review before material TVL or explicitly cap beta payment volume and disclose the review status. Counsel approval does not replace technical audit.

### High: V3 root correctness depends on an off-chain publisher

The vault verifies proof membership and conservation, but it cannot verify World ID, wallet bindings, score inputs, historical balance snapshots, the 10% cap, or whether the root includes the intended wallets. A compromised or careless publisher can publish an incorrect root that is still valid to the contract.

Action: assign publishing to a multisig or equivalent controlled signer, require two independent artifact reproductions, retain the public artifact and protected source digest, cap beta value, monitor every `DistributionPublished` event, and pause on any mismatch.

### High: production cutover can route payments to the wrong economics

The V2 and V3 settlement contracts intentionally share a `settle` ABI. Changing `X402_PAY_TO` is what changes new buyer revenue from durable-holder V2 accounting to active-holder V3 accounting. A wrong address or partially deployed configuration can misroute value or make product copy disagree with settlement.

Action: use `ACTIVE-HOLDER-CUTOVER.md`, verify bytecode and roles, run a shadow epoch, record the exact cutover block, pause paid traffic during the change, and set the dashboard live flag only after the payment challenge names the verified V3 address.

### Medium: Fumadocs build dependency has two unpatched parser advisories

`image-size@2.0.2` can loop indefinitely on crafted ICNS, JXL, or HEIF input.
It is pulled through Fumadocs and currently has no patched release in the
registry advisory. Pollen docs are repository-authored at build time, so this
is not treated as an internet-facing image upload path.

Action: accept only reviewed repository images, do not add untrusted document
uploads to the build, monitor Fumadocs for its replacement parser, and retest a
coordinated Fumadocs/Next major upgrade when available.

### Medium: x402 relayer uses a gas-funded hot EOA

`X402_RELAYER_KEY` can submit settlement transactions and spend its gas balance. It does not sign for buyers, but compromise can drain its native gas funds or disrupt service.

Action: keep only a small gas balance, restrict secret access, monitor native transfers and unexpected transactions, and document rotation. Consider a restricted transaction service if volume grows.

### Medium: smart-wallet payers are not supported

PollenSettlementV2 accepts split ECDSA `v/r/s`, and the relayer explicitly rejects non-65-byte signatures. This is safe failure behavior but limits buyer compatibility.

Action: document EOA-only beta support. Any ERC-1271 redesign needs a new contract and security review.

### Medium: custom API hostname is broken

`api.pollen.id` currently returns Cloudflare 530 / 1016. Buyers cannot rely on the intended canonical origin.

Action: follow `PRODUCTION-DNS-RUNBOOK.md`; retain direct Worker monitoring during cutover.

### Medium: both revenue loops are unproven

Total supply is 55,000, but deployed token and settlement USDC balances and `accRevenuePerShare` are zero. No V2 buyer-to-holder proof exists. V3 is not deployed, so no vault deposit, root publication, or active-holder claim exists either.

Action: do not market realized revenue. Run the approval-gated `BUYER-TO-HOLDER-RUNBOOK.md` only after non-empty production data exists.

### Low: admin authentication has no visible rate limit

The bearer secret is compared at the Worker, and all admin responses are uncached. The code does not add endpoint-specific rate limiting.

Action: use a long random secret, Cloudflare access controls or rate limits where appropriate, and alert on repeated 401/403 responses.

## Key and role inventory

| Capability | Location or owner | Risk boundary |
|---|---|---|
| Token admin | Address in `contracts/deployments/base-mainnet.json` | Can grant/revoke roles and use remaining migration-mint authority subject to cap |
| Token minter | Splits subaccount in deployment record | Can mint only the just-closed epoch within pool cap |
| Splits signer | GitHub Actions secret | Can approve payout proposals under subaccount policy |
| Worker admin | Cloudflare `ADMIN_SECRET` plus GitHub copy | Can trigger rollups and epoch close; cannot mint alone |
| Relayer EOA | Cloudflare `X402_RELAYER_KEY` | Pays gas to submit buyer-signed V2 or future V3 settlement authorizations |
| Database | Cloudflare and payout `NEON_DATABASE_URL` | Contains raw closed receipts, identities, scores, and payout state |
| World ID RP signer | Cloudflare `RP_SIGNING_KEY` | Creates relying-party request signatures |
| Future V3 vault admin | Not assigned | Grants and revokes depositor, publisher, and pauser roles |
| Future V3 root publisher | Not assigned | Can commit reserved vault USDC to an immutable epoch root |
| Future V3 pauser | Not assigned | Can stop deposits, root publication, and claims during an incident |

## Monitoring minimum

- Daily public API and protected scoring/relayer health
- Tuesday epoch-close score count and eligible-contributor count
- Payout dry-run artifact before manual recovery
- Contract bytecode presence and role checks
- Relayer native balance and unexpected transaction alerting
- USDC `RevenueDeposited` and `RevenueClaimed` event monitoring
- V3 `DistributionPublished`, claim, expiry, reserved/available balance, and role-change monitoring after deployment
- Ingestion rejection rate and repeated unauthorized admin access
- Privacy invariant test in CI and k=5 count in every published cell

## Release conclusion

The repository has strong fail-closed privacy, payout, and V3 accounting controls for a limited beta. The active-holder formula is selected and implemented, but V3 is not deployed or live. Production launch remains gated on V3 operating decisions and review posture, real panel scale, deployed automation repair, synchronized admin credentials, working DNS, a non-empty cohort, and a real buyer-to-active-holder proof. Material payment volume should wait for an independent contract review or an explicitly approved capped-beta risk posture.
