import SectionWrapper from "@/components/ui/SectionWrapper";

const captured = [
  "Intent category (e.g. code-generation, debugging, research)",
  "Tool-usage patterns (which tools invoked, how often)",
  "Prompt complexity signals (token count, nesting depth)",
  "Session-level flow patterns (multi-turn sequences)",
  "Anonymized contributor ID (wallet address hash)",
];

const neverSeen = [
  "Raw prompt text",
  "Code snippets or file contents",
  "Personal identifiers or names",
  "API keys, secrets, or credentials",
  "Anything that leaves your machine unclassified",
];

export default function WhatWeCollect() {
  return (
    <SectionWrapper id="privacy">
      <h2 className="font-[family-name:var(--font-playfair)] mb-16 text-center text-3xl font-bold md:text-4xl">
        Transparent by design
      </h2>
      <div className="grid gap-12 md:grid-cols-2">
        {/* What we capture */}
        <div>
          <h3 className="mb-6 text-lg font-semibold text-[var(--accent)]">
            What we capture
          </h3>
          <ul className="space-y-4">
            {captured.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-relaxed">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--pollen-sage)]/30 text-xs text-[var(--accent)]">
                  ✓
                </span>
                <span className="text-[var(--text-secondary)]">{item}</span>
              </li>
            ))}
          </ul>
        </div>
        {/* What we never see */}
        <div>
          <h3 className="mb-6 text-lg font-semibold text-[#c97070]">
            What we never see
          </h3>
          <ul className="space-y-4">
            {neverSeen.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm leading-relaxed">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#c97070]/15 text-xs text-[#c97070]">
                  ✕
                </span>
                <span className="text-[var(--text-secondary)]">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SectionWrapper>
  );
}
