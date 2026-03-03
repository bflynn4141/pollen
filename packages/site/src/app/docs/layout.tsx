import { DocsLayout } from 'fumadocs-ui/layouts/docs'
import type { ReactNode } from 'react'
import { source } from '@/lib/source'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{
        title: 'Pollen',
        url: '/',
      }}
      links={[
        { text: 'Trends', url: '/trends' },
      ]}
    >
      {children}
    </DocsLayout>
  )
}
