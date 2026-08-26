# Pollen

Pollen is a privacy-preserving market index for AI agents: which models,
tools, workflows, and intents are being used, and which observable outcomes
follow.

The founding-panel beta has three parts:

- a local CLI and Claude Code/Codex hooks;
- a closed network-receipt protocol that never includes prompts, arguments,
  source, files, shell output, transcript paths, or credentials; and
- a k-anonymized dashboard that publishes a cell only after at least five
  distinct contributors support it.

## Founding-panel quickstart

Node.js 20+ and an invite code are required. Install the beta from its public
GitHub release:

```bash
npm install --global https://github.com/bflynn4141/pollen/releases/download/cli-v0.1.0-beta.6/pollen-cli-0.1.0-beta.6.tgz
```

Join the founding panel before installing hooks:

```bash
pollen join <invite-code>
```

Install capture hooks for every supported agent detected on the machine, then
verify the installation:

```bash
pollen setup --agents
pollen doctor
```

### Optional payout identity

Capture and contribution do not require a wallet or World ID. Configure them
only if you want to become payout-eligible:

```bash
pollen wallet
pollen verify
```

The weekly payout agent is hard-gated until an epoch has at least five
payout-eligible contributors. Each must have an epoch score, World ID
verification, a registered wallet, and a cryptographically valid wallet
binding. Participation does not guarantee a payout while automation remains
in beta.

### Inspect and contribute

Start a new Claude Code or Codex session after installing hooks. When a
session closes, Pollen durably queues and uploads its closed receipt in the
background. Inspect the local record or retry a failed delivery at any time:

```bash
pollen my
pollen sync --dry-run
pollen sync
```

The dry run prints aggregate counts and uploads nothing. Automatic delivery
and `pollen sync` send a
versioned receipt containing only intent, agent/model,
tool-category sequence, public MCP server/tool identifiers, success and
latency buckets, duration bucket, terminal state, and check result. Unknown or
custom MCP aliases are grouped as `private`; arguments and results never enter
the receipt. The server independently rejects every field outside that schema.

Contributor controls are local and immediate:

```bash
pollen pause
pollen resume
pollen leave --delete-network-data
```

`leave --delete-network-data` revokes the network token, deletes that
contributor's raw server receipts, and recomputes public aggregates. Local
history and identity settings remain on the machine.

## Development

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm --filter @pollen/site dev
```

The demo dashboard is at [http://localhost:3000/dashboard](http://localhost:3000/dashboard).
The public aggregate API is at [pollen-api.bflynn4141.workers.dev](https://pollen-api.bflynn4141.workers.dev).

Buyers can inspect the machine-readable catalog before paying:

```bash
curl https://pollen-api.bflynn4141.workers.dev/catalog
curl https://pollen-api.bflynn4141.workers.dev/network
```

Paid history uses x402 v2 with exact USDC payments on Base. Pollen does not
settle a paid request when no privacy-qualified rows are available. Under the
current contracts, successful query revenue accrues pro rata to all POLLEN
holders. The approved future V3 path instead uses weekly Merkle claims for
recent, World ID-verified contributors who held POLLEN at the epoch boundary,
with activity decay, square-root balance weighting, and a 10% wallet cap. V3
is implemented in this repository but is not deployed or live.

See [launch readiness](./docs/LAUNCH-READINESS.md), the [security
review](./docs/SECURITY-REVIEW.md), and [buyer-to-holder proof
runbook](./docs/BUYER-TO-HOLDER-RUNBOOK.md) for the remaining production gates.
The V3 design and approval gates are in [active-holder architecture](./docs/ACTIVE-HOLDER-ARCHITECTURE.md)
and the [cutover runbook](./docs/ACTIVE-HOLDER-CUTOVER.md).

See [DEMO.md](./DEMO.md) for the demo talk track and privacy contract.

## License

Apache-2.0. See [LICENSE](./LICENSE).
