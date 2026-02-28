'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface AutocompleteItem {
  subject: string
  count: number
}

export default function SearchHero() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([])
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetch(`/api/trends/autocomplete?q=${encodeURIComponent(query)}`)
        .then(res => res.ok ? res.json() : [])
        .then((data: AutocompleteItem[]) => {
          setSuggestions(data)
          setShowDropdown(data.length > 0)
          setSelectedIndex(-1)
        })
        .catch(() => {})
    }, 200)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  function navigate(q: string) {
    if (!q.trim()) return
    setShowDropdown(false)
    router.push(`/trends/explore?q=${encodeURIComponent(q.trim())}`)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        navigate(suggestions[selectedIndex].subject)
      } else {
        navigate(query)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, -1))
    } else if (e.key === 'Escape') {
      setShowDropdown(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="mb-2 text-3xl font-bold text-white">
        What are people <span className="text-[#C8B6FF]">building</span>?
      </h2>
      <p className="mb-6 text-sm text-gray-400">
        Search session subjects extracted from Claude Code usage
      </p>

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setShowDropdown(true) }}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          placeholder="Search subjects... e.g. &quot;auth system&quot;, &quot;MCP server&quot;"
          className="w-full rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-base text-white placeholder-gray-500 outline-none transition-colors focus:border-[#C8B6FF]/60 focus:ring-1 focus:ring-[#C8B6FF]/30"
        />

        {/* Autocomplete dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-xl border border-white/10 bg-[#1a1a2e] shadow-2xl">
            {suggestions.map((item, i) => (
              <button
                key={item.subject}
                onMouseDown={() => navigate(item.subject)}
                className={`flex w-full items-center justify-between px-5 py-2.5 text-left text-sm transition-colors first:rounded-t-xl last:rounded-b-xl ${
                  i === selectedIndex
                    ? 'bg-[#C8B6FF]/10 text-white'
                    : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>{item.subject}</span>
                <span className="text-xs text-gray-500">{item.count} session{item.count !== 1 ? 's' : ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
