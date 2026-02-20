interface GlowCardProps {
  children: React.ReactNode;
  glowColor?: string;
  className?: string;
}

export default function GlowCard({
  children,
  glowColor = "var(--pollen-lavender)",
  className = "",
}: GlowCardProps) {
  return (
    <div className={`relative ${className}`}>
      {/* Glow layer */}
      <div
        className="absolute -inset-4 rounded-2xl opacity-30 blur-2xl"
        style={{ backgroundColor: glowColor }}
      />
      {/* Card content */}
      <div className="relative rounded-xl border border-[var(--text-secondary)]/10 bg-[var(--bg-primary)] px-6 py-8">
        {children}
      </div>
    </div>
  );
}
