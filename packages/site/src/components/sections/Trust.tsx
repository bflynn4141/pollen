import SectionWrapper from "@/components/ui/SectionWrapper";
import GlowCard from "@/components/ui/GlowCard";

const pillars = [
  {
    title: "Open Source",
    description:
      "The classifier, hook, and aggregation pipeline are fully open source. Audit the code. Verify the claims. Fork it if you want.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
      </svg>
    ),
    glowColor: "var(--pollen-blue)",
  },
  {
    title: "World ID Verified",
    description:
      "Sybil-resistant contributor verification. One human, one share. No bots farming the network.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
    glowColor: "var(--pollen-sage)",
  },
  {
    title: "No Prompt Text",
    description:
      "Classification happens on your machine. Only structured features — intent, tool patterns, complexity — ever leave. We never see your prompts.",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    ),
    glowColor: "var(--pollen-pink)",
  },
];

export default function Trust() {
  return (
    <SectionWrapper id="trust">
      <h2 className="font-[family-name:var(--font-playfair)] mb-16 text-center text-3xl font-bold md:text-4xl">
        Built on trust
      </h2>
      <div className="grid gap-8 md:grid-cols-3">
        {pillars.map((pillar) => (
          <GlowCard key={pillar.title} glowColor={pillar.glowColor}>
            <div className="mb-4">{pillar.icon}</div>
            <h3 className="font-[family-name:var(--font-playfair)] text-xl font-semibold">
              {pillar.title}
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
              {pillar.description}
            </p>
          </GlowCard>
        ))}
      </div>
    </SectionWrapper>
  );
}
