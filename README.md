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
npm install --global https://github.com/bflynn4141/pollen/releases/download/cli-v0.1.0-beta.1/pollen-cli-0.1.0-beta.1.tgz
```

Then join before setting up identity:

```bash
pollen join <invite-code>
pollen setup
```

Use Claude Code normally, then inspect and explicitly sync:

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
