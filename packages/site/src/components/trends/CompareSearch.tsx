'use client'

import { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

interface Props {
  suggestions: string[]
  type: 'topics' | 'actions' | 'tools'
}

export default function CompareSearch({ suggestions, type }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selected = searchParams.get('items')?.split(',').filter(Boolean) ?? []
  const [query, setQuery] = useState('')

  const filtered = suggestions.filter(
    s => s.toLowerCase().includes(query.toLowerCase()) && !selected.includes(s)
  ).slice(0, 8)

  function addItem(item: string) {
    const next = [...selected, item]
    updateParams(next, type)
    setQuery('')
  }

  function removeItem(item: string) {
    const next = selected.filter(s => s !== item)
    updateParams(next, type)
  }

  function updateParams(items: string[], t: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (items.length > 0) {
      params.set('items', items.join(','))
    } else {
      params.delete('items')
    }
    params.set('type', t)
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="space-y-3">
      {/* Selected chips */}
      <div className="flex flex-wrap gap-2">
        {selected.map(item => (
          <button
            key={item}
            onClick={() => removeItem(item)}
            className="flex items-center gap-1 rounded-full bg-[#C8B6FF]/20 px-3 py-1 text-sm text-[#C8B6FF] hover:bg-[#C8B6FF]/30"
          >
            {item}
            <span className="text-xs">×</span>
          </button>
        ))}
      </div>

      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Add ${type.slice(0, -1)} to compare...`}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-[#C8B6FF]/50"
        />
        {query && filtered.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border border-white/10 bg-[#1a1a2e] shadow-xl">
            {filtered.map(item => (
              <button
                key={item}
                onClick={() => addItem(item)}
                className="block w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-white/5 hover:text-white"
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Type selector */}
      <div className="flex gap-2">
        {(['topics', 'actions', 'tools'] as const).map(t => (
          <button
            key={t}
            onClick={() => updateParams(selected, t)}
            className={`rounded-md px-3 py-1 text-xs ${
              type === t ? 'bg-[#C8B6FF]/20 text-[#C8B6FF]' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}
