import React from 'react'

export function GiteeIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      {/* Why: flatten the official Gitee "G" mark to match Orca's monochrome provider icons. */}
      <path d="M11.984 0C5.365 0 0 5.365 0 11.984c0 6.62 5.365 11.984 11.984 11.984 6.62 0 11.984-5.365 11.984-11.984C23.968 5.365 18.603 0 11.984 0zm6.458 10.03H11.15a.612.612 0 0 0-.612.612v1.531c0 .338.274.612.612.612h4.388c.338 0 .612.274.612.612v.306c0 1.015-.823 1.837-1.837 1.837H8.7a.612.612 0 0 1-.612-.612V9.112c0-1.015.822-1.837 1.837-1.837h8.517c.338 0 .612.274.612.612v1.531a.612.612 0 0 1-.612.612z" />
    </svg>
  )
}
