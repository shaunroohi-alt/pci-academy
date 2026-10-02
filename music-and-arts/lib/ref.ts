import { randomBytes } from 'node:crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

/** Short human-friendly reference like "BK-7F3K2Q". */
export function makeRef(prefix: 'BK' | 'PS' | 'PB' | 'LS') {
  const bytes = randomBytes(6)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return `${prefix}-${out}`
}
