import FadeInSection from "@/components/ui/FadeInSection";
import PollenCanvas from "@/components/canvas/PollenCanvas";
import Hero from "@/components/sections/Hero";
import HowItWorks from "@/components/sections/HowItWorks";
import WhatWeCollect from "@/components/sections/WhatWeCollect";
import LiveStats from "@/components/sections/LiveStats";
import ForBuyers from "@/components/sections/ForBuyers";
import Trust from "@/components/sections/Trust";
import CTAFooter from "@/components/sections/CTAFooter";

export default function Home() {
  return (
    <>
      <PollenCanvas />
      <main className="relative z-1">
        <Hero />
        <FadeInSection>
          <HowItWorks />
        </FadeInSection>
        <FadeInSection>
          <WhatWeCollect />
        </FadeInSection>
        <FadeInSection>
          <LiveStats />
        </FadeInSection>
        <FadeInSection>
          <ForBuyers />
        </FadeInSection>
        <FadeInSection>
          <Trust />
        </FadeInSection>
        <FadeInSection>
          <CTAFooter />
        </FadeInSection>
      </main>
    </>
  );
}
