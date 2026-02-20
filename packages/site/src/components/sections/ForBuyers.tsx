import SectionWrapper from "@/components/ui/SectionWrapper";

const exampleQuery = `curl -X POST https://api.pollen.dev/v1/query \\
  -H "Content-Type: application/json" \\
  -d '{
    "intent": "code-generation",
    "timeRange": "7d",
    "metrics": ["volume", "complexity", "toolUsage"]
  }'`;

const exampleResponse = `{
  "intent": "code-generation",
  "period": "2026-02-13 → 2026-02-20",
  "volume": 512847,
  "avgComplexity": 3.2,
  "topTools": ["file-edit", "search", "terminal"],
  "trend": "+12% week-over-week",
  "cost": "$0.002"
}`;

export default function ForBuyers() {
  return (
    <SectionWrapper id="buyers">
      <div className="grid items-center gap-12 md:grid-cols-2">
        <div>
          <p className="mb-3 text-sm font-medium tracking-widest uppercase text-[var(--accent)]">
            For data buyers
          </p>
          <h2 className="font-[family-name:var(--font-playfair)] text-3xl font-bold md:text-4xl">
            Query real prompt intelligence
          </h2>
          <p className="mt-4 text-[var(--text-secondary)] leading-relaxed">
            Access aggregated, anonymized insights about how developers actually
            use AI tools. Pay per query via x402 micropayments — no
            subscriptions, no minimums, no vendor lock-in.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-[var(--text-secondary)]">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--pollen-gold)]" />
              Intent distribution and trends
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--pollen-lavender)]" />
              Tool usage patterns across the ecosystem
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--pollen-pink)]" />
              Complexity and session-flow analytics
            </li>
          </ul>
        </div>
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-[var(--text-secondary)]/10 bg-[#2D2A26]">
            <div className="border-b border-white/5 px-4 py-2 text-xs text-gray-500">
              Request
            </div>
            <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-[#FAF8F5]">
              <code>{exampleQuery}</code>
            </pre>
          </div>
          <div className="overflow-hidden rounded-lg border border-[var(--text-secondary)]/10 bg-[#2D2A26]">
            <div className="border-b border-white/5 px-4 py-2 text-xs text-gray-500">
              Response
            </div>
            <pre className="overflow-x-auto p-4 text-xs leading-relaxed text-[var(--pollen-sage)]">
              <code>{exampleResponse}</code>
            </pre>
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
