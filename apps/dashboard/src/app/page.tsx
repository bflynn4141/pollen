export const revalidate = 3600 // refresh live data every hour

import { Suspense } from 'react'
import NavBar from '@/components/landing/NavBar'
import Hero from '@/components/landing/Hero'
import LiveDataPreview from '@/components/landing/LiveDataPreview'
import HowItWorks from '@/components/landing/HowItWorks'
import DataModel from '@/components/landing/DataModel'
import ForDevelopers from '@/components/landing/ForDevelopers'
import StatsBar from '@/components/landing/StatsBar'
import TrustSection from '@/components/landing/TrustSection'
import FinalCTA from '@/components/landing/FinalCTA'
import Footer from '@/components/landing/Footer'

function LiveDataFallback() {
  return (
    <div style={{ padding: '0 80px 80px' }}>
      <div
        className="mx-auto flex h-[400px] max-w-[1280px] items-center justify-center rounded-xl border"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
      >
        <p className="text-[14px]">Loading live data…</p>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <div className="min-h-screen">
      <NavBar />
      <Hero />
      <Suspense fallback={<LiveDataFallback />}>
        <LiveDataPreview />
      </Suspense>
      <HowItWorks />
      <DataModel />
      <ForDevelopers />
      <StatsBar />
      <TrustSection />
      <FinalCTA />
      <Footer />
    </div>
  )
}
