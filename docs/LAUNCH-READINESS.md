# Pollen launch readiness

Status date: 2026-08-26

This is the release gate for the founding-panel beta and paid aggregate API. Repository work can make a gate ready for deployment, but production changes, payments, payouts, and on-chain transactions require separate operator approval.

## Launch order

1. Review the implemented active-holder V3 path and complete its cutover decisions.
2. Recruit and retain the founding panel.
3. Deploy the x402 v2, cron, health, catalog, privacy-copy, and dashboard changes.
4. Repair the custom API hostname and synchronize the Worker and GitHub admin secrets.
5. Observe a successful Tuesday epoch close and a green health check.
6. Reach a real k=5 public cohort and a five-person payout-eligible cohort.
7. Dry-run the weekly payout.
8. Run one authorized, low-value buyer-to-active-holder proof on Base.
9. Review evidence and approve production charging.

Do not reverse this order by weakening k=5, seeding fake production data, or settling an empty paid result.

## Backlog status

| # | Launch task | Status | Release evidence |
|---:|---|---|---|
| 1 | Implement active-holder economics | Ready in repository, production approval required | Approved formula, deterministic planner, archive snapshot, Merkle artifact, V3 settlement and vault, claims API/dashboard, migration, tests, invariants, and cutover runbook are implemented. V2 remains live and unchanged. |
| 2 | Crypto, securities, and tax review | Complete by user assumption | Counsel is not a launch blocker. |
| 3 | Recruit founding panel, minimum k=5 and target 20 active | External work required | Use `FOUNDING-PANEL.md`; do not charge until non-empty public cells exist. |
| 4 | Migrate paid API to x402 v2 | Ready in repository | Official v2 headers and CAIP-2 network, SDK handshake regression, empty-result release behavior. Deployment still required. |
| 5 | Repair `api.pollen.id` | Production blocked | Current response is Cloudflare 530 / error 1016. Use `PRODUCTION-DNS-RUNBOOK.md`. |
| 6 | Repair health and payout automation | Ready in repository, production blocked | Cloudflare Tuesday cron fixed, diagnostics improved, recovery route corrected. Secret sync, deployment, and observation remain. |
| 7 | Prove buyer-to-active-holder loop | Not run | No production payment, V3 vault deposit, root publication, or Merkle claim has occurred. Use `BUYER-TO-HOLDER-RUNBOOK.md`. |
| 8 | Rewrite positioning and consent | Ready in repository | Public copy describes closed receipts, aggregate access, and limits on human-authorship claims. |
| 9 | Build buyer data catalog | Ready in repository | Free `/catalog`, schemas, provenance, freshness, prices, previews, and uncharged below-threshold behavior. |
| 10 | Security review and incident runbooks | Repository review complete, external review not evidenced | V3 role, claim, proof, conservation, expiry, replay, pause, and invariant tests are included. See `SECURITY-REVIEW.md` and `INCIDENT-RUNBOOK.md`. |
| 11 | Personal contributor dashboard | Ready in repository | Personal/network scope plus read-only POLLEN, separately labeled legacy V2 pending USDC, and planned/live V3 Merkle claims. Local config is required for personal wallet state. |

## Hard go/no-go gates

Do not enable paid production traffic until all are true:

- [x] The user confirmed the active-holder formula and the repository implementation, tests, and copy match it.
- [ ] V3 cutover epoch, role owners, claim window, beta value cap, and technical-review posture are approved.
- [ ] `PollenActiveRevenueVault` and `PollenSettlementV3` are deployed, verified, and role-checked only after explicit approval.
- [ ] A shadow epoch reproduces the same source digest, root, cap, carry, and proofs independently.
- [ ] At least five real contributors support one published cell; target 20 active contributors before charging.
- [ ] `api.pollen.id` returns valid TLS and Worker responses without Cloudflare origin errors.
- [ ] x402 v2 is deployed and legacy v1 requests fail closed.
- [ ] An empty paid query returns `charged: false` with no settlement receipt or on-chain payment.
- [ ] Worker and GitHub admin secrets match, without exposing either value.
- [ ] The Tuesday epoch-close trigger produces score rows for the just-closed epoch.
- [ ] Production health is green for at least one scheduled run.
- [ ] Payout dry-run shows the expected eligible cohort and exact allocations.
- [ ] A low-value real buyer-to-active-holder loop produces recorded Base transaction evidence.
- [ ] Monitoring and incident ownership are assigned.

## Evidence bundle

For release approval, save:

- commit SHA and deployment IDs
- public origin and DNS/TLS verification output
- catalog and free-preview response snapshots
- x402 challenge, response status, and settlement transaction hash
- pre/post V3 vault USDC, available revenue, and reserved revenue reads
- epoch-close response and health workflow URL
- POLLEN payout dry-run plus V3 active-revenue artifact and any approved transaction hashes
- contributor count, payout-eligible count, and k=5 publication state
- operator name, timestamp, and approvals for every production write
