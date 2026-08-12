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
npm install --global https://github.com/bflynn4141/pollen/releases/download/cli-v0.1.0-beta.3/pollen-cli-0.1.0-beta.3.tgz
```

Join the founding panel before installing hooks:

```bash
pollen join <invite-code>
```

Choose the setup path for the agent you use.

### Claude Code

Run the guided setup:

```bash
pollen setup
```

The wizard installs Claude Code hooks and offers wallet setup and World ID
verification. If you skip either identity step, you can complete it later:

```bash
pollen wallet
pollen verify
```

### Codex

Install the Codex hooks, then configure the identity steps separately:

```bash
pollen setup --codex
pollen wallet
pollen verify
```

`pollen setup --codex` only installs hooks in `~/.codex/hooks.json`; it does
not run the wallet or World ID flows. A wallet and World ID verification are
the identity inputs required for payout eligibility. Payout automation is
still being validated during the founding-panel beta, so participation does
not guarantee a payout.

### Inspect and contribute

Start a new Claude Code or Codex session after installing hooks. When that
session is complete, inspect the local record and explicitly sync it:

```bash
pollen my
pollen sync
```

`pollen sync` sends a versioned receipt containing only intent, agent/model,
tool-category sequence, duration bucket, terminal state, and check result. The
server independently rejects every field outside that schema.

## Development

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm --filter @pollen/site dev
```

The demo dashboard is at [http://localhost:3000/dashboard](http://localhost:3000/dashboard).
The public aggregate API is at [pollen-api.bflynn4141.workers.dev](https://pollen-api.bflynn4141.workers.dev).

See [DEMO.md](./DEMO.md) for the demo talk track and privacy contract.

## License

Apache-2.0. See [LICENSE](./LICENSE).
