# Buyer-to-active-holder proof runbook

## Purpose

Prove one real external V3 loop on Base with auditable evidence:

1. an external buyer pays for non-empty, privacy-qualified Pollen data;
2. PollenSettlementV3 settles the exact USDC amount;
3. PollenActiveRevenueVault receives the revenue;
4. a closed-epoch artifact uses verified activity and the boundary POLLEN snapshot;
5. the approved root reserves USDC; and
6. an eligible wallet claims its proved amount.

This loop has not been demonstrated. The repository implementation, token
supply, a draft root, or a dashboard preview is not evidence of buyer demand or
realized contributor revenue.

## Approval boundary

Read-only preparation is safe. Deploying V3, changing settlement, funding a
buyer, signing or settling payment, publishing a root, and claiming USDC are
separate on-chain financial actions. Each requires explicit approval for the
exact address, amount, route, epoch, root, and network relevant to that step.

Use a $0.01 non-empty route for the first proof. Do not use the export route to
create a larger transaction.

## Preconditions

- [ ] Every gate in `ACTIVE-HOLDER-CUTOVER.md` is complete.
- [ ] V3 contracts are deployed, verified, independently reviewed under the
      approved beta posture, and assigned to the approved roles.
- [ ] x402 v2 and empty-result protection are deployed.
- [ ] The payment challenge names the verified PollenSettlementV3 address.
- [ ] The public API origin is healthy.
- [ ] A real k=5 cell and a known non-empty $0.01 history route exist.
- [ ] Production health and the Tuesday epoch close are green.
- [ ] The external buyer has only the approved amount plus required gas.
- [ ] The first distribution has at least ten eligible wallets, or the operator
      has explicitly recorded the strict-cap carry expected with fewer wallets.

## Baseline reads

Record UTC time, latest block, buyer USDC, V3 settlement USDC, vault USDC,
`availableRevenue()`, `reservedRevenue()`, relevant roles, and current payment
challenge. Confirm V2 balances separately so the proof cannot confuse the two
economics paths.

## Buyer payment

1. Save `GET /catalog` and a free preview response.
2. Request the known non-empty $0.01 route without payment.
3. Decode and verify `PAYMENT-REQUIRED`: x402 v2, `eip155:8453`, exact Base
   USDC, exact amount, and verified PollenSettlementV3 address.
4. With exact payment approval, sign the EIP-3009 authorization and retry with
   `PAYMENT-SIGNATURE`.
5. Save the non-empty response and decoded `PAYMENT-RESPONSE`.
6. Confirm the settlement transaction moved the exact amount from buyer to V3
   settlement to vault, leaving no USDC in settlement.

Stop if data is empty, `warming_up`, the settlement receipt is missing, the
price differs, or the pay-to address is V2 or unknown.

## Weekly artifact

After the epoch closes:

1. identify the last Base block at or before the exact UTC epoch boundary
2. reconcile the pool to V3 `RevenueDeposited` events in the epoch plus prior
   documented carry
3. generate the read-only artifact using the exact archive block
4. reproduce it independently and compare source digest and Merkle root
5. verify World ID, wallet binding, four-epoch weights, positive snapshot
   holdings, square-root weights, 10% caps, deterministic dust, and carry
6. verify every proof and `allocated + carry = pool`
7. publish the public artifact without private contributor or identity fields

## Root publication

Root publication is a distinct transaction approval. Record the exact epoch,
root, allocated amount, snapshot block, claim deadline, vault, and publisher.
After approval, publish once and confirm the event and stored distribution match
every approved value. The root is immutable for that epoch.

## Merkle claim

Claiming is another financial action. After approval:

1. fetch the wallet's public proof from `/active-revenue/claims/:wallet`
2. compare epoch, index, amount, root, vault, deadline, and status to the saved
   artifact and on-chain distribution
3. record wallet and vault USDC balances
4. submit the claim from the wallet or a relayer
5. confirm USDC went only to the proved wallet
6. confirm the index is marked claimed, reserved revenue fell by the exact
   amount, and replay fails

## Evidence record

Save route, price, response row count, privacy support count, payment and claim
transaction hashes, blocks, vault before/after values, artifact source digest,
root, snapshot block, cap and carry checks, claim amount, and timestamps. Do not
publish private keys, reusable signatures, credentials, contributor IDs, World
ID nullifiers, raw receipts, or prompt text.

## Legacy V2 note

V2 has not demonstrated a buyer-to-holder loop either. Do not use a V2 payment
as evidence that V3 rewards active contributors. Existing V2 USDC, if any is
later deposited before cutover, remains governed and claimable under V2.
