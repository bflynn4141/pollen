"use client";

import { useState, useCallback } from "react";

interface ConnectButtonProps {
  className?: string;
}

/**
 * Connect Wallet button.
 *
 * For Phase 0, this is a visual placeholder that shows the CTA.
 * When Para SDK is integrated (with NEXT_PUBLIC_PARA_API_KEY set),
 * it will open the Para modal on click.
 *
 * Without the SDK, clicking shows a "coming soon" state.
 */
export default function ConnectButton({ className = "" }: ConnectButtonProps) {
  const [clicked, setClicked] = useState(false);

  const handleClick = useCallback(() => {
    // TODO: Wire to Para modal when SDK is configured
    // For now, show a gentle "coming soon" feedback
    setClicked(true);
    setTimeout(() => setClicked(false), 2000);
  }, []);

  return (
    <button
      onClick={handleClick}
      className={`rounded-full bg-[var(--accent)] px-8 py-3 text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95 ${className}`}
    >
      {clicked ? "Coming Soon" : "Connect Wallet"}
    </button>
  );
}
