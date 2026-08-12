/**
 * hooks.js — small shared hooks for the admin panel.
 */

import { useState, useEffect } from 'react'

// matchMedia-based (not a raw resize-driven width number) so it only
// re-renders at the breakpoint crossing instead of on every resize pixel,
// and needs no debounce.
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false))
  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    setMatches(mql.matches)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}

// Matches the public site's existing 768px breakpoint (style.css).
export function useIsNarrow() {
  return useMediaQuery('(max-width: 768px)')
}
