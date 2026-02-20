"use client";

import { useState, useCallback } from "react";

interface CodeSnippetProps {
  code: string;
  language?: string;
}

export default function CodeSnippet({ code, language = "bash" }: CodeSnippetProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="group relative rounded-lg border border-[var(--text-secondary)]/10 bg-[#2D2A26] px-5 py-4 font-mono text-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        {language && (
          <span className="ml-2 text-xs text-gray-500">{language}</span>
        )}
      </div>
      <code className="text-[#FAF8F5]">
        <span className="text-[var(--pollen-sage)]">$</span> {code}
      </code>
      <button
        onClick={handleCopy}
        className="absolute right-3 top-3 rounded px-2 py-1 text-xs text-gray-400 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}
