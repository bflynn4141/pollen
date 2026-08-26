# Economics decision

## Decision status

On 2026-08-26, the user approved the active-holder formula below for Pollen's
future revenue path. Repository design and implementation are authorized.
Deployment, settlement changes, contract upgrades, token transfers, payouts,
and every other on-chain action still require separate approval.

PollenTokenV2 and PollenSettlementV2 remain deployed and unchanged. Until a
V3 cutover is approved and completed, V2 continues to accrue USDC pro rata to
all POLLEN holders.

## Approved active-holder formula

For revenue epoch `e`:

1. A contributor must have a positive score in at least one of epochs `e`,
   `e-1`, `e-2`, or `e-3`.
2. Activity uses weights `1.0`, `0.5`, `0.25`, and `0.125`, newest to oldest.
3. The contributor must have a verified World ID and a cryptographically bound
   wallet. One contributor ID, World ID nullifier, and wallet may appear only
   once in an artifact. Any duplicate aborts the plan.
4. The wallet must hold a positive POLLEN balance at the last Base block at or
   before the UTC boundary that closes epoch `e`.
5. Raw weight is `decayed activity * integer square root(snapshot POLLEN wei)`.
6. No wallet may receive more than 10% of the distributable pool.
7. Cap excess is redistributed by the same raw weights among uncapped wallets.
8. Integer dust goes to the largest fractional remainders, with lowercase
   wallet address as the deterministic tie-breaker.
9. Claims use a weekly Merkle root published to a new USDC revenue vault.

The implementation keeps all score math in integer microunits. It represents
the recency weights as `8, 4, 2, 1` over a common denominator of eight. The
denominator cancels during proportional allocation.

## Strict-cap carry

A strict 10% cap makes full distribution impossible when fewer than ten
wallets qualify. Atomic rounding can also leave an indivisible remainder.
The implementation never breaks the approved cap. Any amount that cannot be
assigned becomes carry in the vault for a future approved distribution.

This is a mathematical consequence of the cap, not a privacy-threshold
exception. Pollen does not add fake wallets, weaken identity checks, or lower
the cap to make a pool appear fully distributed.

## Current V2 and future V3

| Concern | Deployed V2 | Implemented future V3 |
|---|---|---|
| Revenue recipient | Every POLLEN holder | Recent, verified contributors who held POLLEN at the boundary |
| Weight | POLLEN balance | Decayed activity times square-root POLLEN balance |
| Concentration limit | None | 10% per wallet per revenue epoch |
| Delivery | `PollenTokenV2.claimRevenue()` | Weekly Merkle claim from `PollenActiveRevenueVault` |
| Settlement | `PollenSettlementV2` | ABI-compatible `PollenSettlementV3` |
| Production status | Deployed | Repository only, not deployed or live |

V2 claim rights are not migrated or erased. After a future cutover, previously
accrued V2 USDC remains claimable from PollenTokenV2 while new buyer payments
route to the V3 vault.

## Parameters intentionally left for cutover approval

The formula is fixed. These operating values are not economics changes, but
they must be recorded before deployment:

- first V3 revenue epoch and exact cutover block
- vault admin, root publisher, and emergency pauser addresses
- claim deadline for each root; the contract enforces a minimum of 30 days and
  the runbook recommends 90 days for beta
- archive RPC and independent artifact reviewer
- first distribution amount reconciled to V3 deposit events and prior carry

See `ACTIVE-HOLDER-ARCHITECTURE.md` and `ACTIVE-HOLDER-CUTOVER.md`.
