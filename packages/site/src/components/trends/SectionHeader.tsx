interface Props {
  id: string
  title: string
  subtitle?: string
  badge?: string
}

export default function SectionHeader({ id, title, subtitle, badge }: Props) {
  return (
    <div id={id} className="scroll-mt-24 pt-16 pb-6">
      <div className="flex items-baseline gap-4">
        <h2
          className="font-[family-name:var(--font-grotesk)] text-2xl font-bold sm:text-3xl"
          style={{ color: 'var(--t-text, #1A1A1A)' }}
        >
          {title}
        </h2>
        {badge && (
          <span
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{ background: 'var(--t-bar-track, #F0EBE6)', color: 'var(--t-text-muted, #8A8A82)' }}
          >
            {badge}
          </span>
        )}
      </div>
      {subtitle && (
        <p className="mt-2 text-sm" style={{ color: 'var(--t-text-muted, #8A8A82)' }}>{subtitle}</p>
      )}
    </div>
  )
}
