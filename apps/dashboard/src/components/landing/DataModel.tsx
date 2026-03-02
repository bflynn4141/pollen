export default function DataModel() {
  return (
    <section style={{ padding: '80px 80px' }}>
      <p
        className="text-[12px] font-semibold tracking-[0.14em]"
        style={{ color: 'var(--color-brand)' }}
      >
        THE DATASET
      </p>
      <h2 className="mt-4 font-[family-name:var(--font-grotesk)] text-[36px] font-bold leading-tight tracking-[-0.02em] text-text">
        What we actually collect.
      </h2>
      <p
        className="mt-3 max-w-[520px] text-[16px] leading-[1.6]"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        Every session becomes a structured record — intent, tools, commands, model.
        No code. No prompts. No file contents.
      </p>

      {/* Terminal + annotations */}
      <div className="mt-10 grid grid-cols-[1fr_260px] gap-8">
        {/* Terminal */}
        <div
          className="overflow-hidden rounded-xl font-[family-name:var(--font-mono)] text-[13px] leading-[2]"
          style={{ backgroundColor: '#1A1A1A', padding: '32px' }}
        >
          {/* Prompt line */}
          <div>
            <span style={{ color: 'var(--color-terminal-dim)' }}>$ </span>
            <span style={{ color: '#D4D0CC' }}>claude </span>
            <span style={{ color: '#A09A94' }}>&quot;add auth to the Next.js app with email/password&quot;</span>
          </div>

          {/* Intent extraction */}
          <div className="mt-1">
            <span style={{ color: 'var(--color-terminal-dim)' }}>→ </span>
            <span style={{ color: '#A09A94' }}>Intent: </span>
            <span className="font-semibold" style={{ color: 'var(--color-brand)' }}>Build authentication flow</span>
          </div>

          {/* Blank line */}
          <div className="mt-3">
            <span style={{ color: 'var(--color-terminal-dim)' }}>→ </span>
            <span style={{ color: 'var(--color-terminal-tool)' }}>figma · get_screenshot</span>
          </div>
          <div>
            <span style={{ color: 'var(--color-terminal-dim)' }}>→ </span>
            <span style={{ color: 'var(--color-terminal-tool)' }}>supabase · create_table</span>
          </div>
          <div>
            <span style={{ color: 'var(--color-terminal-dim)' }}>→ </span>
            <span style={{ color: 'var(--color-terminal-tool)' }}>context7 · resolve-library-id</span>
          </div>

          {/* Commands */}
          <div className="mt-3">
            <span style={{ color: 'var(--color-terminal-dim)' }}>$ </span>
            <span style={{ color: 'var(--color-terminal-dim)' }}>git commit -m &quot;add auth middleware&quot;</span>
          </div>
          <div>
            <span style={{ color: 'var(--color-terminal-dim)' }}>$ </span>
            <span style={{ color: 'var(--color-terminal-dim)' }}>npm run dev</span>
          </div>

          {/* Model */}
          <div className="mt-3">
            <span style={{ color: 'var(--color-terminal-dim)' }}>→ </span>
            <span style={{ color: '#A09A94' }}>Model: </span>
            <span style={{ color: 'var(--color-terminal-model)' }}>claude-sonnet-4.5</span>
          </div>
        </div>

        {/* Annotations */}
        <div className="flex flex-col justify-center gap-10">
          <div>
            <p
              className="text-[11px] font-semibold tracking-[0.08em]"
              style={{ color: 'var(--color-brand)' }}
            >
              SESSION INTENTS
            </p>
            <p className="mt-1.5 text-[13px] leading-[1.5]" style={{ color: 'var(--color-text-secondary)' }}>
              What each session is about — extracted from context, not your code.
            </p>
          </div>
          <div>
            <p
              className="text-[11px] font-semibold tracking-[0.08em]"
              style={{ color: 'var(--color-terminal-tool)' }}
            >
              MCP TOOL CALLS
            </p>
            <p className="mt-1.5 text-[13px] leading-[1.5]" style={{ color: 'var(--color-text-secondary)' }}>
              Which MCP servers and tools developers are actually using.
            </p>
          </div>
          <div>
            <p
              className="text-[11px] font-semibold tracking-[0.08em]"
              style={{ color: 'var(--color-terminal-dim)' }}
            >
              COMMANDS & MODELS
            </p>
            <p className="mt-1.5 text-[13px] leading-[1.5]" style={{ color: 'var(--color-text-secondary)' }}>
              Shell commands and model choices — the full picture of developer workflow.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
