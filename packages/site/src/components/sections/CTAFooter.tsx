import CodeSnippet from "@/components/ui/CodeSnippet";
import ConnectButton from "@/components/wallet/ConnectButton";

export default function CTAFooter() {
  return (
    <section className="relative px-6 py-32 text-center">
      <h2 className="font-[family-name:var(--font-playfair)] text-3xl font-bold md:text-5xl">
        Start pollinating
      </h2>
      <p className="mx-auto mt-4 max-w-lg text-[var(--text-secondary)] leading-relaxed">
        One command to opt in. Your prompts stay local. Your insights earn
        crypto.
      </p>
      <div className="mx-auto mt-10 max-w-sm">
        <CodeSnippet code="npx pollen init" />
      </div>
      <div className="mt-8">
        <ConnectButton />
      </div>
      {/* Footer links */}
      <div className="mt-20 flex flex-wrap items-center justify-center gap-6 text-xs text-[var(--text-secondary)]">
        <a href="https://github.com/pollen-protocol" className="hover:text-[var(--accent)] transition-colors">
          GitHub
        </a>
        <span className="text-[var(--text-secondary)]/30">|</span>
        <a href="https://docs.pollen.dev" className="hover:text-[var(--accent)] transition-colors">
          Docs
        </a>
        <span className="text-[var(--text-secondary)]/30">|</span>
        <a href="https://x.com/pollen_protocol" className="hover:text-[var(--accent)] transition-colors">
          X / Twitter
        </a>
      </div>
      <p className="mt-4 text-xs text-[var(--text-secondary)]/50">
        Pollen Protocol — 2026
      </p>
    </section>
  );
}
