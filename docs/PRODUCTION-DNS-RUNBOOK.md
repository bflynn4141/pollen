# Production hostname runbook

## Verified origins

Read-only checks on 2026-08-26 established two production surfaces controlled
by this project:

- Site: `https://pollen-iota.vercel.app`
- API: `https://pollen-api.bflynn4141.workers.dev`

The API origin returns HTTP 200 for `/catalog` and `/network`, valid TLS, and
the privacy-correct `warming_up` state while no real k=5 cohort exists.

## Domain collision

Do not use `pollen.id` or `api.pollen.id` for this product. The apex currently
serves an unrelated Pollen DeFi trading and prediction-market site. Its public
DNS also contains `_github-challenge-PollenDeFi`, mail, and search-verification
records. The Cloudflare account authenticated for this repository does not own
that zone.

Changing the broken `api.pollen.id` record could interfere with a third party
and would make the prompt-intelligence product look affiliated with an
unrelated protocol. The old custom-domain route therefore remains absent from
`packages/worker/wrangler.toml`.

## Current verification

```bash
curl --fail --show-error --silent https://pollen-api.bflynn4141.workers.dev/catalog
curl --fail --show-error --silent https://pollen-api.bflynn4141.workers.dev/network
curl -i https://pollen-api.bflynn4141.workers.dev/grid
curl --fail --show-error --silent https://pollen-iota.vercel.app
```

Acceptance criteria:

- both verified origins have valid TLS
- `/catalog` returns HTTP 200 and advertises x402 version 2
- `/network` returns HTTP 200 with `k_anonymity: 5`; `warming_up` is valid until
  a real cohort qualifies
- unpaid `/grid` returns HTTP 402 with `PAYMENT-REQUIRED`
- no public copy links this project to `pollen.id`

## Future custom domain

A short, project-owned domain would improve buyer trust, but it is not needed
to run the beta. Before adding one:

1. confirm ownership in the same operator account used for deployment
2. check for product and trademark confusion
3. add the hostname as a Worker custom domain
4. retain the `workers.dev` address as the diagnostic origin
5. verify TLS, catalog, network, payment challenge, and rollback behavior

Do not move another party's zone or replace its DNS records as part of this
launch.
