# Active-holder revenue architecture

## Status

This is the implemented repository design for a future V3 revenue path. It is
not deployed. PollenTokenV2 and PollenSettlementV2 remain the production path.

## Data flow

```text
privacy-qualified buyer response
  -> x402 v2 EIP-3009 authorization
  -> PollenSettlementV3
  -> PollenActiveRevenueVault
  -> closed-epoch score and identity audit
  -> epoch-boundary POLLEN archive snapshot
  -> deterministic allocation artifact and Merkle root
  -> publisher review and root publication
  -> wallet or relayer submits proof
  -> vault sends USDC only to the proved wallet
```

Raw prompt text, source code, file contents, tool arguments, tool results, and
World ID nullifiers never appear in the public claim artifact.

## Off-chain planner

`packages/agent/src/active-revenue-plan.ts` reads the last four closed score
epochs and accepts only verified World ID rows with valid EIP-191 wallet
bindings. `pollen-snapshot.ts` requires an explicit historical Base block and
reads every `balanceOf` at that exact block. It rejects a block after the epoch
boundary or more than 15 minutes before it. An archive-capable RPC is required.

`active-holder.ts` applies the approved weights, square-root balance factor,
10% cap, cap redistribution, and deterministic dust rule. Duplicated
contributor IDs, World IDs, wallets, or score epochs abort the plan.

`active-revenue-pool.ts` reconciles unique V3 `RevenueDeposited` events inside
the exact epoch block window plus documented prior carry. Duplicate or
out-of-window events fail closed. Two reviewers should fetch events from
independent sources and compare the resulting pool before passing its atomic
USDC value to the planner.

`active-revenue-artifact.ts` emits a deterministic public JSON document with:

- formula and schema versions
- epoch and snapshot metadata
- exact atomic-USDC pool, allocation, cap, and carry values
- a digest of the protected source input
- Merkle root
- wallet, amount, index, and proof for each public claim

Contributor IDs and World ID nullifiers are committed into the protected
source digest but omitted from the public artifact.

`active-revenue-draft-store.ts` revalidates the root, every proof, indices,
wallet uniqueness, cap, and pool conservation before atomically replacing a
database draft. It refuses to replace a published or expired epoch.

The read-only CLI command is:

```bash
pollen-agent active-revenue-plan \
  --epoch <closed-epoch> \
  --pool-atomic <exact-usdc-atomic-units> \
  --snapshot-block <boundary-block>
```

It requires `NEON_DATABASE_URL`, `POLLEN_TOKEN_ADDRESS`, and an archive RPC in
`BASE_ARCHIVE_RPC_URL` or `BASE_RPC_URL`. The command prints JSON. It cannot
write the database, publish a root, or send a transaction.

## Merkle format

Wallets are sorted by lowercase address before zero-based indices are assigned.
The leaf format matches OpenZeppelin StandardMerkleTree:

```text
keccak256(bytes.concat(keccak256(abi.encode(epoch, index, wallet, amount))))
```

Sibling pairs are sorted before hashing. The TypeScript and Solidity suites
share a fixed vector so a proof generated off-chain is proven claimable by the
vault implementation.

## Contracts

`PollenSettlementV3` preserves the V2 `settle` ABI. It executes the buyer's
EIP-3009 authorization and deposits the exact USDC amount into the vault.

`PollenActiveRevenueVault` separates duties:

- `DEPOSITOR_ROLE`: only the approved V3 settlement
- `PUBLISHER_ROLE`: publishes a root for a closed epoch
- `PAUSER_ROLE`: pauses deposits, publications, and claims during an incident
- `DEFAULT_ADMIN_ROLE`: manages roles

Published epoch roots are immutable. Revenue committed to an open claim window
is reserved and cannot back another root. Claims use a bitmap to prevent replay,
update accounting before transfer, and always pay the address encoded in the
leaf even when a relayer submits the transaction. After the deadline, anyone
may expire the distribution and release unclaimed USDC into carry.

## Database and claim surface

Migration `013_active_revenue.sql` stores distribution metadata and public
claim proofs. Its constraints enforce exact pool accounting and one claim per
wallet per epoch. The free endpoint is:

```text
GET /api/v1/active-revenue/claims/:wallet
```

It exposes only public Merkle material. The dashboard keeps legacy V2 pending
USDC separate from V3 claims and displays V3 as planned unless the explicit
cutover variable is `live`.

## Trust and review boundary

World ID, wallet binding, scores, historical block selection, and the 10% cap
are verified by the planner and reviewer, not by the vault. A compromised root
publisher could publish an incorrect but internally valid root. Production
therefore requires a multisig or equivalent publisher policy, independent
artifact reproduction, public artifact retention, monitoring, and a technical
contract audit before material value is held.
