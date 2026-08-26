# Active-holder V3 cutover runbook

## Approval boundary

This document prepares a future cutover. Do not deploy contracts, grant roles,
change `X402_PAY_TO`, set the live flag, fund wallets, settle a payment, publish
a root, or submit a claim without explicit approval for that exact action.

## Compatibility rule

V2 is not upgraded. Its bytecode, balances, accrued USDC, and claim method stay
unchanged. The V3 settlement and vault are additive contracts. At cutover, only
new x402 authorizations change destination. Existing V2 claims remain available.

## Required decisions

- [ ] first V3 epoch and cutover block
- [ ] final admin multisig
- [ ] root publisher policy and signer threshold
- [ ] emergency pauser
- [ ] claim window; 90 days is recommended for beta and 30 days is the minimum
- [ ] archive RPC and independent artifact reviewer
- [ ] beta value cap and external technical-audit acceptance

## Repository checks

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm audit --prod
cd contracts
forge fmt --check src/PollenActiveRevenueVault.sol src/PollenSettlementV3.sol \
  test/PollenActiveRevenueVault.t.sol test/PollenSettlementV3.t.sol \
  test/PollenActiveRevenueVaultInvariant.t.sol script/DeployV3.s.sol
forge build
forge test --force
```

Record the fixed TypeScript/Solidity Merkle vector result, invariant run count,
remaining dependency advisories, and independent review outcome.

## Deployment preparation

1. Apply migration `013_active_revenue.sql` and verify its constraints in the
   target database. The manual `Production recovery` GitHub workflow runs this
   transactionally without exporting the Neon credential to an operator machine.
2. Reproduce and review a draft allocation using archive RPC data. A zero-root
   artifact or fewer than ten eligible wallets is valid, but the strict-cap
   carry must be understood. A zero root cannot be published.
3. Simulate `DeployV3.s.sol` on a Base fork. Confirm the final admin role,
   publisher role, pauser role, settlement-only depositor role, max approval,
   token addresses, and bytecode.
4. Obtain explicit deployment approval. Broadcast only after simulation
   evidence matches the approval.
5. Verify contracts and save addresses and constructor arguments. Do not change
   production settlement yet.

## Shadow epoch

For at least one closed epoch, keep V2 live and run V3 in shadow mode:

1. identify the exact epoch-boundary Base block
2. sum candidate V3 revenue from observed payments without moving funds
3. generate the artifact twice, independently
4. compare source digest, root, allocations, cap, carry, and proof checks
5. confirm World ID and wallet duplicates fail closed
6. publish no root and send no transaction

## Settlement cutover

After separate approval:

1. pause paid traffic or use a defined maintenance window
2. record the last V2-eligible authorization timestamp and block
3. update `X402_PAY_TO` to PollenSettlementV3 and deploy the Worker
4. verify the x402 v2 challenge names the exact V3 address
5. set `ACTIVE_REVENUE_CUTOVER_STATUS=live` only after the address is verified
6. resume with the smallest paid route and its production value cap
7. monitor V2 and V3 settlement addresses for routing overlap

Never attempt to migrate already-accrued V2 USDC into V3.

## First distribution

1. Reconcile the pool to V3 `RevenueDeposited` events within the closed epoch,
   plus documented prior carry.
2. Generate and independently reproduce the artifact.
3. Verify `allocated + carry = pool`, every amount is at or below the 10% cap,
   the snapshot is the last block at or before the boundary, and all proofs pass.
4. Save the protected source record and publish the public artifact.
5. Obtain explicit root-publication approval for epoch, root, amount, snapshot
   block, deadline, and publisher.
6. Publish the root, then reconcile the transaction event and database status.
7. Test one separately approved low-value claim and confirm it pays the proved
   wallet, not the relayer.

## Rollback

Before any root is published, paid traffic can be paused and `X402_PAY_TO` can
be restored to V2 with explicit approval. After V3 revenue is deposited, do not
route or withdraw it through an improvised path. Pause, preserve evidence, and
follow the incident runbook. Published roots are immutable; correction requires
handling the affected value under an approved incident plan.
