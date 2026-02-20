import CodeSnippet from "@/components/ui/CodeSnippet";
import ConnectButton from "@/components/wallet/ConnectButton";

export default function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="mb-4 text-sm font-medium tracking-widest uppercase text-[var(--accent)]">
        Prompt Intelligence Network
      </p>
      <h1 className="font-[family-name:var(--font-playfair)] text-5xl leading-tight font-bold tracking-tight md:text-7xl">
        Your prompts pollinate
        <br />
        <span className="bg-gradient-to-r from-[var(--pollen-pink)] via-[var(--pollen-lavender)] to-[var(--pollen-blue)] bg-clip-text text-transparent">
          shared intelligence
        </span>
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--text-secondary)] md:text-xl">
        Opt in via a CLI hook. Prompts are classified locally — no raw text
        leaves your machine. Anonymized features flow into a shared network.
        Buyers query insights. Contributors earn crypto.
      </p>
      <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
        <ConnectButton />
        <div className="w-72">
          <CodeSnippet code="npx pollen init" />
        </div>
      </div>
      {/* Scroll hint */}
      <div className="absolute bottom-8 animate-bounce text-[var(--text-secondary)]/50">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M7 13l5 5 5-5M7 6l5 5 5-5" />
        </svg>
      </div>
    </section>
  );
}
