# `api.pollen.id` production DNS runbook

## Current diagnosis

Read-only checks on 2026-08-26 found:

- `https://api.pollen.id/overview` returns HTTP 530 with Cloudflare error 1016.
- `api.pollen.id` resolves to Cloudflare edge IPs, but Cloudflare has no usable origin or Worker custom-domain binding for that hostname.
- `packages/worker/wrangler.toml` has the custom-domain route disabled because the `pollen.id` zone and Worker login are in different Cloudflare accounts.
- `https://pollen-api.bflynn4141.workers.dev/network` returns HTTP 200 and the privacy-correct `warming_up` state.

Changing only the proxied DNS record is not sufficient. The hostname needs an active Worker custom-domain binding in the Cloudflare account that owns the zone.

## Change plan

This is a production configuration change and requires explicit approval.

1. Identify the Cloudflare account that owns the `pollen.id` zone and the account that owns the `pollen-api` Worker.
2. Choose one ownership model:
   - Recommended: manage or deploy the Worker from the zone-owning account, then add `api.pollen.id` as a Worker custom domain.
   - Alternative: move the zone to the Worker-owning account, with a separate DNS migration plan.
3. Remove or replace the current conflicting `api` DNS record as required by Cloudflare's custom-domain flow.
4. Re-enable the `routes` entry in `packages/worker/wrangler.toml` only when the deployment identity can see the zone.
5. Deploy the already-reviewed Worker build.
6. Wait for certificate issuance and DNS propagation.

Do not expose Cloudflare tokens in terminal output, workflow logs, or the repository.

## Verification

Run from a network outside the Cloudflare account:

```bash
curl --fail --show-error --silent https://api.pollen.id/catalog
curl --fail --show-error --silent https://api.pollen.id/network
curl -i https://api.pollen.id/grid
```

Acceptance criteria:

- TLS certificate is valid for `api.pollen.id`.
- `/catalog` returns HTTP 200 and advertises x402 version 2.
- `/network` returns HTTP 200 with `k_anonymity: 5`; `warming_up` is acceptable until a real cohort qualifies.
- Unpaid `/grid` returns HTTP 402 with `PAYMENT-REQUIRED`.
- No response contains Cloudflare 1016, 522, or 530.
- The `workers.dev` origin remains available during the verification window.

After verification, update operational health checks to use the custom hostname and keep one direct-origin check for diagnosing route failures.

## Rollback

If the custom domain fails, remove or disable its Worker binding and restore the last known DNS configuration. Continue serving the documented `workers.dev` origin. DNS rollback does not authorize a Worker code rollback or deployment.
