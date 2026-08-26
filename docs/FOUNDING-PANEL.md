# Founding panel operating plan

## Goal

Recruit at least 20 active contributors before charging buyers. Five distinct contributors is the privacy minimum for a published cell and the independent minimum for payout eligibility, but it is not a healthy panel target. A 20-person target leaves room for inactivity, incomplete wallet setup, and diversity across agents and workflows.

## Recruitment sequence

1. Invite 5 internal or trusted design partners and validate installation, consent, deletion, and support.
2. Expand to 10 contributors and verify receipt delivery plus a real k=5 public cell.
3. Expand to 20 active contributors across multiple coding-agent and workflow profiles.
4. Maintain a waitlist so the panel does not fall below the privacy threshold when members pause or leave.

Do not use synthetic receipts, shared contributor identities, or duplicated installations to cross k=5.

## Invite script

> Pollen is an opt-in network for privacy-safe aggregate prompt intelligence. Local hooks turn completed coding-agent sessions into coarse receipts. Prompt text, code, paths, shell output, tool arguments, and tool results never enter the network receipt. Public cells need at least five distinct contributors. You can inspect local data, preview uploads, pause capture, or permanently delete your network receipts. Founding-panel participation can make you eligible for future rewards, but it does not guarantee payment.

Send invite codes individually. Do not post reusable codes publicly.

## Onboarding checklist

- [ ] Contributor reads [What Leaves Your Device](../packages/site/content/docs/contributing-data.mdx).
- [ ] Contributor installs the published CLI from the approved release.
- [ ] `pollen join <invite-code>` succeeds.
- [ ] `pollen setup --agents` and `pollen doctor` succeed.
- [ ] Contributor runs `pollen my` and understands local vs network data.
- [ ] Contributor runs `pollen sync --dry-run` before the first manual sync.
- [ ] Contributor knows `pause`, `resume`, and `leave --delete-network-data`.
- [ ] Wallet and World ID are presented as optional for capture and required for payout eligibility.
- [ ] Support owner records installation state without collecting secrets or raw prompt content.

## Active-contributor definition

For launch tracking, active means at least one accepted production receipt in the last seven days from a distinct registered contributor. Track separately:

- registered contributors
- seven-day active contributors
- contributors in at least one published k=5 cell
- payout-eligible contributors with score, World ID, and wallet binding
- paused, left, failed-sync, and support-needed states

## Weekly review

- Inspect contribution health with the protected admin endpoint.
- Confirm no public cell has fewer than five contributors.
- Review client failure rates and retry backlog.
- Contact contributors who opted into support, without asking for raw prompts.
- Record whether the network is `warming_up` or `live`.
- Delay buyer charging if the published dataset is empty or unrepresentative.

## Exit criteria

The founding-panel gate is complete only when there are at least 20 active real contributors, one or more non-empty privacy-qualified public windows, informed consent evidence, tested deletion, and an identified support owner.
