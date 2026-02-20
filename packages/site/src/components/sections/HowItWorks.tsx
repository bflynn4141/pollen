import SectionWrapper from "@/components/ui/SectionWrapper";
import GlowCard from "@/components/ui/GlowCard";

const steps = [
  {
    number: "01",
    title: "Install",
    description:
      "One command adds the Pollen hook to your CLI. It runs a local classifier on each prompt — no raw text ever leaves your machine.",
    glowColor: "var(--pollen-pink)",
  },
  {
    number: "02",
    title: "Contribute",
    description:
      "Anonymized features — intent category, tool usage patterns, complexity signals — flow into the Pollen network. Your prompts stay yours.",
    glowColor: "var(--pollen-lavender)",
  },
  {
    number: "03",
    title: "Earn",
    description:
      "Buyers query aggregated insights via x402 micropayments. Revenue flows back to contributors proportionally. Better prompts, bigger share.",
    glowColor: "var(--pollen-gold)",
  },
];

export default function HowItWorks() {
  return (
    <SectionWrapper id="how-it-works">
      <h2 className="font-[family-name:var(--font-playfair)] mb-16 text-center text-3xl font-bold md:text-4xl">
        How it works
      </h2>
      <div className="grid gap-8 md:grid-cols-3">
        {steps.map((step) => (
          <GlowCard key={step.number} glowColor={step.glowColor}>
            <span className="text-4xl font-bold text-[var(--accent)]/20">
              {step.number}
            </span>
            <h3 className="font-[family-name:var(--font-playfair)] mt-3 text-xl font-semibold">
              {step.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
              {step.description}
            </p>
          </GlowCard>
        ))}
      </div>
    </SectionWrapper>
  );
}
