import type { SimpleIcon } from 'simple-icons'
import {
  siAirtable,
  siApollographql,
  siAsana,
  siBox,
  siBrave,
  siCloudflare,
  siDocker,
  siFigma,
  siGithub,
  siGmail,
  siGooglecalendar,
  siGoogledrive,
  siHubspot,
  siKubernetes,
  siLinear,
  siNeon,
  siNotion,
  siPostgresql,
  siPosthog,
  siPuppeteer,
  siReplit,
  siSemrush,
  siSentry,
  siStripe,
  siSupabase,
  siVercel,
  siZotero,
} from 'simple-icons'

// Trusted, bundled brand artwork. Never accept icon URLs or SVG content from
// contributor receipts: that would create a tracking and injection surface.
const MCP_ICONS: Record<string, SimpleIcon> = {
  airtable: siAirtable,
  apollo: siApollographql,
  asana: siAsana,
  box: siBox,
  'brave-search': siBrave,
  cloudflare: siCloudflare,
  docker: siDocker,
  figma: siFigma,
  github: siGithub,
  gmail: siGmail,
  'google-calendar': siGooglecalendar,
  'google-drive': siGoogledrive,
  hubspot: siHubspot,
  kubernetes: siKubernetes,
  linear: siLinear,
  neon: siNeon,
  notion: siNotion,
  postgres: siPostgresql,
  posthog: siPosthog,
  puppeteer: siPuppeteer,
  replit: siReplit,
  semrush: siSemrush,
  sentry: siSentry,
  stripe: siStripe,
  supabase: siSupabase,
  vercel: siVercel,
  zotero: siZotero,
}

const MONOCHROME_MARKS = new Set(['github', 'linear', 'notion', 'vercel'])

export function McpBrandMark({ id }: { id: string }) {
  const icon = MCP_ICONS[id]
  if (!icon) return null
  const fill = MONOCHROME_MARKS.has(id) ? 'currentColor' : `#${icon.hex}`
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" role="img">
      <path fill={fill} d={icon.path} />
    </svg>
  )
}

export function hasMcpBrandMark(id: string): boolean {
  return id in MCP_ICONS
}
