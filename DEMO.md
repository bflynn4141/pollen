# Pollen demo runbook

## Start

```bash
pnpm --filter @pollen/site dev
```

Open [http://localhost:3000/dashboard](http://localhost:3000/dashboard). Keep the browser at 100% zoom. The core market story now fits in the first desktop viewport.

## Two-minute talk track

1. **State the market problem.** “Agents choose models, tools, MCP servers, and workflows every day, but nobody has a neutral market view of what they actually use or what reliably works across vendors.”
2. **Read the terminal.** Point to the market tape, model table, and tools rail: “This is a Dexscreener-like market terminal for the complete agent stack. Adoption uses a frozen eligible-contributor denominator, not event-volume theater.” Open a ranking page and switch between 24H, 7D, and 30D to show that the URL, rank order, attributed volume, movers, and trend shapes update together.
3. **Connect usage to outcomes.** Open Workflow rankings: “Pollen connects intent → model → tool → sequence → observable outcome. Completion stays separately labeled so we do not claim more than the evidence supports.”
4. **Show market depth.** Move between Model, Tool, Workflow, and Intent rankings while preserving the selected interval: “The overview is the market homepage; each category has its own deeper terminal.”
5. **Earn trust and land the destination.** Open Methodology: “Contributors inspect the exact receipt leaving their machine. Raw content never joins the network. This trusted public index is the wedge toward Bloomberg for the agent economy.”

## Honest answers

- **Is this live market data?** No. It is a deterministic synthetic founding-panel snapshot designed to demonstrate the approved product and privacy contract.
- **What is real today?** Claude Code and Codex hooks, local storage/classification/coarsening, the versioned closed receipt, invite registration, hashed bearer authentication, production receipt ingest, k-thresholded rollup primitives, the contributor dashboard, and fixture assertions.
- **What still needs to be built?** Contributor self-service deletion/recomputation, live receipt-backed dashboard adapters, whole-snapshot composition auditing for live data, representative panel recruitment, and engagement measurement.
- **Why a static snapshot?** A small founding panel cannot safely support real-time slices. V0 freezes one seven-day window and suppresses cells below `k = 5` or vulnerable to composition attacks.
- **Is this global market share?** No. It is labeled as a descriptive panel index. Representative market claims require a much larger and less biased panel.

## Demo data contract

The fixture at `packages/site/src/data/demo-network.ts` is synthetic and fails closed at import time if:

- any published model, tool, intent, or workflow has fewer than five contributors;
- adoption percentages do not match the frozen eligible-contributor denominator;
- summary totals do not reconcile with publishable cells;
- forbidden raw-content keys appear; or
- the whole-snapshot composition audit is not marked passed.

The expanded ranking fixture at `packages/site/src/data/demo-rankings.ts` adds 24H, 7D, and 30D views. Each window freezes its eligible panel before calculating adoption, enforces `k ≥ 5`, and labels row volume as attributed activity because a session can appear in multiple entity or category rows.

## Comprehension check

After a practice run, ask: “What is Pollen, and what data leaves the computer?”

A clear answer is: “Pollen is a neutral intelligence network for agent usage and outcomes. It derives a small, inspectable receipt locally; raw prompts, files, commands, and identities stay private.”
