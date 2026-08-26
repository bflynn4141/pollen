# Pollen contracts

## Production V2

- `PollenTokenV2.sol`: POLLEN issuance, weekly mint caps, and legacy pro-rata
  holder USDC accounting
- `PollenSettlementV2.sol`: EIP-3009/x402 settlement into PollenTokenV2

These contracts remain deployed and unchanged.

## Future active-holder V3

- `PollenSettlementV3.sol`: ABI-compatible settlement into a separate vault
- `PollenActiveRevenueVault.sol`: role-separated deposits, immutable closed-epoch
  Merkle roots, replay-safe claims, accounting reservations, pause, and expiry
- `script/DeployV3.s.sol`: approval-gated deployment and temporary-admin handoff

V3 is repository implementation only. It has not been deployed and must not be
presented as live. See `../docs/ACTIVE-HOLDER-ARCHITECTURE.md` and
`../docs/ACTIVE-HOLDER-CUTOVER.md`.

## Verification

```bash
forge build
forge test --force
```

The suite includes V2 regressions, V3 role and claim tests, a fixed
TypeScript/Solidity proof vector, fuzz tests, and stateful vault invariants.

Formatting only the active V3 files:

```bash
forge fmt --check src/PollenActiveRevenueVault.sol src/PollenSettlementV3.sol \
  test/PollenActiveRevenueVault.t.sol test/PollenSettlementV3.t.sol \
  test/PollenActiveRevenueVaultInvariant.t.sol script/DeployV3.s.sol
```
