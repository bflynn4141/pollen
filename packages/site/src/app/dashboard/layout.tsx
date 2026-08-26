import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { DashboardAutoRefresh } from './dashboard-auto-refresh'

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers()
  const host = (requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost:3000')
    .split(',')[0]
    .trim()
  const protocol = (requestHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https'))
    .split(',')[0]
    .trim()
  const imageUrl = new URL('/og.png', `${protocol}://${host}`).toString()
  const title = 'Pollen Demo — Intelligence for the Agent Economy'
  const description = 'An illustrative market index for the models, tools, and workflows agents use—built from privacy-thresholded synthetic data.'

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{
        url: imageUrl,
        width: 1440,
        height: 900,
        alt: 'Pollen dashboard demo — intelligence for the agent economy',
      }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  }
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<DashboardAutoRefresh /></>
}
