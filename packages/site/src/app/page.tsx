import { NavBar } from '@/components/NavBar'
import { Hero } from '@/components/Hero'
import { DataPreview } from '@/components/DataPreview'
import { HowItWorks } from '@/components/HowItWorks'
import { DataModel } from '@/components/DataModel'
import { ForDevelopers } from '@/components/ForDevelopers'
import { StatsBar } from '@/components/StatsBar'
import { Trust } from '@/components/Trust'
import { CtaFooter } from '@/components/CtaFooter'

export default function Home() {
  return (
    <>
      <NavBar />
      <main>
        <Hero />
        <DataPreview />
        <HowItWorks />
        <DataModel />
        <ForDevelopers />
        <StatsBar />
        <Trust />
        <CtaFooter />
      </main>
    </>
  )
}
