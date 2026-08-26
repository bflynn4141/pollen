# Pollen incident runbook

## First principles

Protect contributor privacy and funds before availability. Do not lower k=5, replay payments, retry payouts blindly, delete evidence, or expose secrets while diagnosing an incident.

Production writes, secret rotation, deployment, payout execution, contract role changes, and on-chain transactions require an authorized incident commander.

## Severity

- SEV-1: suspected prompt/code leakage, unauthorized mint or revenue claim, incorrect V3 Merkle root, compromised admin/minter/publisher key, duplicate settlement, or public cell below k=5
- SEV-2: payout ambiguity, relayer compromise without user-fund loss, database write outage, broken custom domain, or health checks failing across components
- SEV-3: stale aggregates, isolated client upload failures, dashboard degradation, or documentation mismatch

## Immediate response

1. Name an incident commander, operator, communications owner, and scribe.
2. Record UTC start time, observed symptoms, affected origins, contract addresses, and last known good deployment.
3. Preserve workflow logs, Worker logs, request IDs, transaction hashes, and database audit evidence.
4. Stop the smallest affected write path with approval. Prefer pausing payout or deployment automation over broad account changes.
5. Keep read-only health and chain inspection running.
6. Communicate facts, uncertainty, and next update time. Do not claim impact is absent until checked.

For a future V3 incident, the approved pauser may stop deposits, root publication, and claims. Pausing, role changes, settlement rerouting, and corrective transactions are production actions and require the incident authority defined at cutover. Preserve the source artifact, root, snapshot block, role events, claimed bitmap, and vault accounting before proposing a remedy. Published roots are immutable.

## Privacy incident

Trigger: a receipt contains a forbidden field, a public row has fewer than five contributors, or individual data can be inferred.

1. Stop receipt ingestion and public aggregate serving with approval.
2. Preserve the offending schema, row identifiers, and relevant code version without copying sensitive contents into chat or tickets.
3. Check whether the issue is local-only, raw closed-receipt storage, rollup publication, caching, or downstream export.
4. Purge affected caches only after evidence is preserved.
5. Delete or recompute affected public aggregates using the approved deletion path.
6. Write a failing regression test before the fix.
7. Reopen only after the closed-schema and k=5 suites pass and affected data is no longer accessible.

## Admin-secret compromise or mismatch

1. Confirm with HTTP status and timestamps; never print either secret.
2. With approval, generate one new random value.
3. Update Worker `ADMIN_SECRET` and GitHub `WORKER_ADMIN_SECRET` in the same change window.
4. Revoke the old value.
5. Test protected health, rollup, and epoch-close authorization without triggering writes unless separately approved.
6. Review admin endpoint logs for unauthorized requests.

## Relayer-key compromise

1. Inspect the relayer address, native balance, pending transactions, and unexpected transfers.
2. Stop paid endpoints or relayer execution with approval.
3. Move no buyer funds. Buyer authorizations are exact and recipient-bound.
4. Rotate the relayer key, fund only the approved minimal gas amount, update the Worker secret, and deploy with approval.
5. Verify nonce reservations and settlement events before reopening.

## Payout failure or ambiguity

1. Do not start a new payout with plain retry.
2. Read `epoch_scores`, `payouts`, stored Splits proposal IDs, and on-chain receipts.
3. If no scores exist, use the protected epoch-close recovery route only with approval and only for the just-closed payable epoch.
4. Run `--dry-run` and save the exact cohort and amounts.
5. If rows are pending, use `--resume` so stored proposals are reconciled rather than replaced.
6. If any transaction state is ambiguous, stop and resolve it on-chain before further minting.

## Contract or role incident

1. Confirm bytecode, admin role, minter role, total supply, current epoch, minted amount, and relevant transaction receipts through two RPC providers.
2. If role compromise is suspected, prepare a least-privilege revoke/grant transaction for the authorized multisig.
3. Obtain explicit signer approval and simulate before submission.
4. Record proposal ID, signer set, transaction hash, and final role state.
5. Contract state cannot be rolled back. Plan migration rather than pretending a deployment rollback reverses chain activity.

## DNS or API-origin incident

1. Compare `api.pollen.id` with the direct `workers.dev` origin.
2. Check TLS, DNS, Worker custom-domain binding, and Cloudflare error code.
3. If the direct origin works, publish it as the temporary approved endpoint and stop paid traffic through the failing hostname.
4. Follow `PRODUCTION-DNS-RUNBOOK.md`; do not improvise a proxied origin record.

## Recovery verification

- Root cause has a regression test or configuration invariant.
- Privacy threshold remains five.
- No empty paid response was settled.
- Health checks distinguish authentication from component failure.
- Payout state is reconciled with chain receipts.
- Secrets are absent from logs and artifacts.
- Public status and documentation match the recovered state.
- Incident commander explicitly approves reopening.

## Post-incident

Within two business days, record impact, timeline, detection, root cause, contributing factors, corrective actions, evidence links, owners, and deadlines. Add durable repository tests or runbook updates. Do not close an action merely because service has resumed.
