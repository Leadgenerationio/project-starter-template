/**
 * UK Postcode area utilities.
 *
 * A UK postcode like "SA1 2AB" has:
 *   area = "SA" (alphabetic prefix before the first digit)
 *   district = "SA1" (area + district number)
 *
 * Single-letter areas (B, E, G, L, M, N, S, W) share their letter with
 * multi-letter areas (e.g. M vs MK, ML). When filtering by "M" we only
 * want M0-M9, not MK, ML, etc. We handle this by expanding single-letter
 * areas to M0%, M1%, …, M9% LIKE patterns.
 */

/** Areas that are a single letter and share their prefix with longer areas */
const SINGLE_LETTER_AREAS = new Set(['B', 'E', 'G', 'L', 'M', 'N', 'S', 'W'])

/** Extract the alphabetic area prefix from a full UK postcode */
export function extractArea(postcode: string): string {
  const match = postcode.trim().match(/^([A-Za-z]+)/)
  return match ? match[1].toUpperCase() : ''
}

/**
 * Build a Supabase PostgREST `.or()` filter string from selected area prefixes.
 *
 * Single-letter areas → M0%, M1%, …, M9% (avoids matching MK, ML, etc.)
 * Multi-letter areas  → SA%, KA% (no ambiguity)
 */
export function buildPostcodeOrFilter(areas: string[]): string {
  const parts: string[] = []
  for (const area of areas) {
    const upper = area.toUpperCase().trim()
    if (!upper) continue
    // Only allow alphabetic area codes to prevent filter injection
    if (!/^[A-Z]{1,2}$/.test(upper)) continue
    if (SINGLE_LETTER_AREAS.has(upper) && upper.length === 1) {
      for (let d = 0; d <= 9; d++) {
        parts.push(`postcode.ilike.${upper}${d}%`)
      }
    } else {
      parts.push(`postcode.ilike.${upper}%`)
    }
  }
  return parts.join(',')
}
