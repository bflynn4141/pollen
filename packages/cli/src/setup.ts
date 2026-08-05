/**
 * `pollen setup` — Guided onboarding wizard.
 *
 * Walks through: hooks → wallet → World ID verification.
 * Idempotent — skips already-completed steps with checkmarks.
 *
 * `pollen setup --demo` — Same flow, zero side effects.
 * No writes to settings.json, config, or wallet API.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { loadConfig, getWalletAddress, runInteractiveWallet } from './config.js'
import { runVerify } from './verify.js'

const HOME = process.env.HOME ?? '~'
const SETTINGS_PATH = join(HOME, '.claude', 'settings.json')

// Hook events pollen needs to be registered on
const POLLEN_HOOK_EVENTS = [
  'UserPromptSubmit',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
  'SessionStart',
  'SessionEnd',
  'PreToolUse',
  'SubagentStart',
  'SubagentStop',
  'Notification',
  'PreCompact',
  // v5 capture upgrades (Claude Code v2.1.211)
  'UserPromptExpansion',
  'StopFailure',
  'PermissionRequest',
  'PermissionDenied',
  'PostCompact',
] as const

/** The hook entry installed for new users (published npm package) */
function makePollenHookEntry() {
  return {
    matcher: '',
    hooks: [
      {
        type: 'command' as const,
        command: 'npx @anthropic/pollen-hook',
        timeout: 10,
      },
    ],
  }
}

/** Detect whether a hook entry is a pollen hook (any format) */
function isPollenHook(entry: any): boolean {
  // Matcher-based format: { matcher, hooks: [{ command }] }
  if (entry?.hooks && Array.isArray(entry.hooks)) {
    return entry.hooks.some((h: any) =>
      typeof h.command === 'string' &&
      (h.command.includes('pollen') || h.command.includes('@pollen/'))
    )
  }
  // Flat format: { type, command }
  if (typeof entry?.command === 'string') {
    return entry.command.includes('pollen') || entry.command.includes('@pollen/')
  }
  return false
}

function ask(rl: ReturnType<typeof createInterface>, q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, resolve))
}

const MOCK_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18'

export async function runSetup(demo = false): Promise<void> {
  console.log('')
  console.log('  ██████╗  ██████╗ ██╗     ██╗     ███████╗███╗   ██╗')
  console.log('  ██╔══██╗██╔═══██╗██║     ██║     ██╔════╝████╗  ██║')
  console.log('  ██████╔╝██║   ██║██║     ██║     █████╗  ██╔██╗ ██║')
  console.log('  ██╔═══╝ ██║   ██║██║     ██║     ██╔══╝  ██║╚██╗██║')
  console.log('  ██║     ╚██████╔╝███████╗███████╗███████╗██║ ╚████║')
  console.log('  ╚═╝      ╚═════╝ ╚══════╝╚══════╝╚══════╝╚═╝  ╚═══╝')
  console.log('')
  console.log('  Guided setup for new contributors')
  console.log('')

  const rl = createInterface({ input: process.stdin, output: process.stdout })

  let hooksOk = false
  let walletOk = false
  let verifyOk = false

  // ── Step 1: Hooks ──────────────────────────────────────────

  console.log('  Step 1/3 — Claude Code hooks')
  console.log('')

  try {
    hooksOk = await installHooks(rl, demo)
  } catch (err: any) {
    console.log(`  ⚠  Hook installation failed: ${err.message}`)
    console.log('  You can manually add hooks later. Continuing...')
    console.log('')
  }

  // ── Step 2: Wallet ─────────────────────────────────────────

  console.log('  Step 2/3 — Wallet')
  console.log('')

  if (demo) {
    walletOk = await demoWallet(rl)
    console.log('')
  } else {
    const existingAddr = getWalletAddress()
    if (existingAddr) {
      console.log(`  ✓ Wallet already configured: ${existingAddr}`)
      console.log('')
      walletOk = true
    } else {
      try {
        rl.close() // close our rl — runInteractiveWallet creates its own
        const result = await runInteractiveWallet([]) // empty argv = interactive mode
        walletOk = !!result.address
      } catch (err: any) {
        console.error(`  Wallet setup failed: ${err.message}`)
        console.log('  You can set up a wallet later: `pollen wallet`')
      }
      console.log('')
    }
  }

  // ── Step 3: World ID Verification ──────────────────────────

  console.log('  Step 3/3 — World ID verification')
  console.log('')

  if (!demo) {
    const config = loadConfig()
    if (config?.world_id) {
      console.log('  ✓ Already verified')
      console.log(`    Nullifier: ${config.world_id.nullifier_hash.slice(0, 18)}...`)
      console.log('')
      verifyOk = true
    } else {
      verifyOk = await promptVerify(demo)
    }
  } else {
    verifyOk = await promptVerify(demo)
  }

  // ── Eligibility ────────────────────────────────────────────

  console.log('  Verified + registered wallets earn weekly POLLEN payouts (epochs close Tuesdays 00:00 UTC).')
  console.log('')

  // ── Summary ────────────────────────────────────────────────

  console.log('  ┌─────────────────────────────────┐')
  console.log('  │  Setup complete                  │')
  console.log('  │                                  │')
  console.log(`  │  ${hooksOk ? '✓' : '○'} Hooks              ${hooksOk ? '           ' : '  (pending)'}│`)
  console.log(`  │  ${walletOk ? '✓' : '○'} Wallet             ${walletOk ? '          ' : ' (pending)'}│`)
  console.log(`  │  ${verifyOk ? '✓' : '○'} World ID           ${verifyOk ? '          ' : ' (pending)'}│`)
  console.log('  │                                  │')
  if (!verifyOk) {
    console.log('  │  Remember: `pollen verify`       │')
    console.log('  │  to unlock token claims           │')
    console.log('  │                                  │')
  }
  console.log('  └─────────────────────────────────┘')
  console.log('')
  console.log('  Next steps:')
  console.log('    pollen sync       Push local data to Neon')
  console.log('    pollen earnings   Check your credits and balance')
  console.log('    pollen my         Interactive dashboard')
  console.log('')
}

/** Step 3 helper — prompt for World ID verification (shared by real + demo) */
async function promptVerify(demo: boolean): Promise<boolean> {
  console.log('  ┌─────────────────────────────────────────────────┐')
  console.log('  │  ⚠  World ID Required to Claim Tokens          │')
  console.log('  │                                                 │')
  console.log('  │  You can earn IVS right away, but claiming      │')
  console.log('  │  POLLEN tokens requires World ID verification.  │')
  console.log('  │                                                 │')
  console.log('  │  You\'ll need: World App on your phone           │')
  console.log('  │  (worldcoin.org/download)                       │')
  console.log('  └─────────────────────────────────────────────────┘')
  console.log('')

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await ask(rl, '  Verify now? (requires phone with World App) [y/N] ')
  rl.close()

  if (answer.trim().toLowerCase() !== 'y') {
    console.log('  Skipped. You can verify later: `pollen verify`')
    console.log('')
    return false
  }

  console.log('')

  // Real World ID flow — in demo mode, QR is scannable but nothing is saved
  try {
    await runVerify({ save: !demo })
    return true
  } catch (err: any) {
    console.error(`  Verification failed: ${err.message}`)
    console.log('  You can verify later: `pollen verify`')
    console.log('')
    return false
  }
}

/** Demo wallet flow — interactive prompts but no API calls or writes */
async function demoWallet(rl: ReturnType<typeof createInterface>): Promise<boolean> {
  console.log('  How do you want to set up your wallet?')
  console.log('')
  console.log('  1. Create a managed wallet (recommended)')
  console.log('     Email-based. No private keys to manage. Claim tokens with one command.')
  console.log('')
  console.log('  2. Use your own wallet')
  console.log('     Bring an existing Ethereum address. You\'ll need your private key to claim.')
  console.log('')

  const choice = await ask(rl, '  Choice [1]: ')
  const picked = choice.trim() || '1'

  if (picked === '1') {
    const email = await ask(rl, '  Email: ')
    if (!email.trim() || !email.includes('@')) {
      console.log('  Invalid email.')
      return false
    }
    console.log('')
    console.log('  Sending verification code...')
    await new Promise(r => setTimeout(r, 800))
    console.log('  ✓ Code sent! Check your email.')
    console.log('')
    const code = await ask(rl, '  Verification code: ')
    if (!code.trim()) {
      console.log('  No code entered.')
      return false
    }
    await new Promise(r => setTimeout(r, 600))
    console.log('')
    console.log(`  ✓ Wallet created: ${MOCK_ADDRESS}`)
    console.log(`    Linked to: ${email.trim()}`)
    console.log('')
    console.log('  For full wallet features (send, swap, sign):')
    console.log('    Install Clara MCP: claude mcp add clara -- npx @clara/mcp')
  } else {
    const addr = await ask(rl, '  Ethereum address (0x...): ')
    if (!addr.trim().startsWith('0x')) {
      console.log('  Invalid Ethereum address.')
      return false
    }
    console.log('')
    console.log(`  ✓ Wallet registered: ${addr.trim()}`)
    console.log('    Note: You\'ll need POLLEN_PRIVATE_KEY to claim tokens.')
  }

  return true
}

/** Install pollen hooks into ~/.claude/settings.json. Returns true if hooks are installed. */
async function installHooks(rl: ReturnType<typeof createInterface>, demo: boolean): Promise<boolean> {
  // In demo mode, always show the "fresh install" flow regardless of actual state
  if (demo) {
    console.log(`  Will add pollen hook to ${POLLEN_HOOK_EVENTS.length} events:`)
    for (const event of POLLEN_HOOK_EVENTS) {
      console.log(`    + ${event}`)
    }
    console.log('')
    console.log('  This adds to ~/.claude/settings.json (existing hooks preserved).')
    console.log('')

    const answer = await ask(rl, '  Install hooks? [Y/n] ')
    if (answer.trim().toLowerCase() === 'n') {
      console.log('  Skipped. You can add hooks manually later.')
      console.log('')
      return false
    }

    console.log(`  ✓ Hooks installed`)
    console.log('')
    return true
  }

  // ── Real mode ──

  let settings: any = {}

  if (existsSync(SETTINGS_PATH)) {
    const raw = readFileSync(SETTINGS_PATH, 'utf-8')
    try {
      settings = JSON.parse(raw)
    } catch {
      console.log('  ⚠  ~/.claude/settings.json exists but is malformed JSON.')
      console.log('  Skipping hook installation to avoid overwriting your file.')
      console.log('  Fix the JSON manually, then run `pollen setup` again.')
      console.log('')
      return false
    }
  }

  if (!settings.hooks) {
    settings.hooks = {}
  }

  // Check which events are missing pollen hooks
  const missing: string[] = []
  for (const event of POLLEN_HOOK_EVENTS) {
    const entries = settings.hooks[event]
    if (Array.isArray(entries) && entries.some(isPollenHook)) {
      continue // already installed for this event
    }
    missing.push(event)
  }

  if (missing.length === 0) {
    console.log('  ✓ Hooks already installed')
    console.log('')
    return true
  }

  // Show what we'll add
  console.log(`  Will add pollen hook to ${missing.length} event${missing.length > 1 ? 's' : ''}:`)
  for (const event of missing) {
    console.log(`    + ${event}`)
  }
  console.log('')
  console.log('  This adds to ~/.claude/settings.json (existing hooks preserved).')
  console.log('')

  const answer = await ask(rl, '  Install hooks? [Y/n] ')
  if (answer.trim().toLowerCase() === 'n') {
    console.log('  Skipped. You can add hooks manually later.')
    console.log('')
    return false
  }

  // Merge hooks in — append only, never remove
  for (const event of missing) {
    if (!Array.isArray(settings.hooks[event])) {
      settings.hooks[event] = []
    }
    settings.hooks[event].push(makePollenHookEntry())
  }

  // Write back
  const dir = join(HOME, '.claude')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n')

  console.log('  ✓ Hooks installed')
  console.log('')
  return true
}
