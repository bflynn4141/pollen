export type DashboardIconName =
  | 'market'
  | 'models'
  | 'tools'
  | 'workflow'
  | 'intent'
  | 'trust'
  | 'search'
  | 'external'
  | 'terminal'
  | 'read'
  | 'edit'
  | 'private'

type IconProps = { name: DashboardIconName; size?: number; className?: string }

export function DashboardIcon({ name, size = 15, className }: IconProps) {
  const paths: Record<DashboardIconName, React.ReactNode> = {
    market: <><path d="M3 3v18h18" /><path d="m7 16 4-5 4 3 5-7" /></>,
    models: <><path d="m12 2 8.5 4.8v10.4L12 22l-8.5-4.8V6.8Z" /><path d="m3.8 6.7 8.2 4.7 8.2-4.7M12 22V11.4" /></>,
    tools: <><path d="M14.7 6.3a4 4 0 0 0-5-5l2.1 2.1-2.4 2.4-2.1-2.1a4 4 0 0 0 5 5l7.2 7.2a2 2 0 0 1-2.8 2.8l-7.2-7.2" /><path d="m6.5 13.5-4.8 4.8a2 2 0 0 0 2.8 2.8l4.8-4.8" /></>,
    workflow: <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="6" r="2" /><circle cx="6" cy="19" r="2" /><path d="M6 7v10M8 5h4a6 6 0 0 1 6 6v3" /></>,
    intent: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    trust: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /><path d="m9 12 2 2 4-4" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    external: <><path d="M15 3h6v6M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
    terminal: <><path d="m4 17 6-5-6-5M12 19h8" /></>,
    read: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    private: <><path d="m12 3-1.7 3.8L6.5 8.5l3.8 1.7L12 14l1.7-3.8 3.8-1.7-3.8-1.7Z" /><path d="m19 15-.9 2.1L16 18l2.1.9L19 21l.9-2.1L22 18l-2.1-.9Z" /><path d="m5 14-.9 2.1L2 17l2.1.9L5 20l.9-2.1L8 17l-2.1-.9Z" /></>,
  }

  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

export function AnthropicMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.304 3.541h-3.672l6.697 16.918H24Zm-10.608 0L0 20.459h3.744l1.37-3.553h7.005l1.369 3.553h3.744L10.536 3.541Zm-.371 10.223 2.291-5.945 2.292 5.945Z" /></svg>
}

export function OpenAIMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22.282 9.821a6 6 0 0 0-.516-4.91 6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9 6.05 6.05 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206 6 6 0 0 0 3.997-2.9 6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l4.92-2.839a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l4.925 2.844a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.5 4.5 0 0 1 2.366-1.973V11.6a.77.77 0 0 0 .388.677l5.815 3.354-2.02 1.168a.08.08 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896m16.597 3.855-5.833-3.387L15.119 7.2a.08.08 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023-4.915-2.867a.78.78 0 0 0-.785 0L9.409 9.23V6.897a.07.07 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.679M8.307 12.863l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453L8.704 5.46a.8.8 0 0 0-.393.681Zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5Z" /></svg>
}

export function GitHubMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .3a12 12 0 0 0-3.79 23.38c.6.11.82-.26.82-.58l-.02-2.04c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.09-.73.09-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18.76.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.63-5.48 5.92.42.36.81 1.1.81 2.22l-.02 3.29c0 .31.21.69.83.57A12 12 0 0 0 12 .3" /></svg>
}

export function PlaywrightMark() {
  return <svg viewBox="0 0 256 192" aria-hidden="true"><path fill="#e2574c" d="M103 139v-17l-46 13s3-20 28-27c7-2 13-2 18-1V39h23c-3-8-5-14-7-18-3-7-7-2-15 4-5 5-19 15-40 21-21 5-38 4-46 3-10-2-15-4-14 3 0 7 2 17 5 31 8 30 35 88 85 75 13-4 22-11 28-19Zm-75-55 36-10s-1 14-14 18-22-8-22-8" /><path fill="#2ead33" d="M237 40c-9 2-31 4-59-4-27-7-45-20-53-26-10-9-14-15-19-6-4 8-9 21-14 39-10 39-18 121 47 139 64 17 99-58 109-97 5-18 7-32 8-40 0-10-6-8-19-5M107 72s10-16 27-11c18 5 19 24 19 24Zm42 71c-30-9-35-33-35-33l81 23s-16 19-46 10m29-50s10-16 27-10c17 5 19 24 19 24Z" /></svg>
}

export function EntityMark({ id, provider }: { id: string; provider?: string }) {
  if (provider === 'Anthropic') return <AnthropicMark />
  if (provider === 'OpenAI') return <OpenAIMark />
  if (id === 'github-mcp') return <GitHubMark />
  if (id === 'playwright') return <PlaywrightMark />
  if (id === 'shell') return <DashboardIcon name="terminal" />
  if (id === 'read-search' || id === 'file-system') return <DashboardIcon name="read" />
  if (id === 'edit-write') return <DashboardIcon name="edit" />
  if (id === 'web-browser' || id === 'docs-search') return <DashboardIcon name="search" />
  if (id === 'task-planner') return <DashboardIcon name="workflow" />
  if (id === 'database') return <DashboardIcon name="models" />
  return <DashboardIcon name="intent" />
}
