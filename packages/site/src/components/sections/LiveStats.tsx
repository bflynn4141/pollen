import SectionWrapper from "@/components/ui/SectionWrapper";

const mockStats = [
  { label: "Contributors", value: "2,847", subtext: "active this week" },
  { label: "Prompts classified", value: "1.2M", subtext: "and counting" },
  { label: "Top intent", value: "code-gen", subtext: "42% of all prompts" },
  { label: "Earned by network", value: "$4,210", subtext: "via x402 micropayments" },
];

export default function LiveStats() {
  return (
    <SectionWrapper transparent id="stats">
      <h2 className="font-[family-name:var(--font-playfair)] mb-16 text-center text-3xl font-bold md:text-4xl">
        The network is growing
      </h2>
      <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
        {mockStats.map((stat) => (
          <div key={stat.label} className="text-center">
            <p className="font-[family-name:var(--font-playfair)] text-4xl font-bold text-[var(--accent)] md:text-5xl">
              {stat.value}
            </p>
            <p className="mt-2 text-sm font-semibold">{stat.label}</p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {stat.subtext}
            </p>
          </div>
        ))}
      </div>
    </SectionWrapper>
  );
}
