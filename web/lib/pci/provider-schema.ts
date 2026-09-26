// Converts the observation report's JSON Schema into the subset accepted by
// model structured-output features: every object closed, and no numeric,
// length, pattern or tuple constraints. Those constraints are not lost —
// the full Zod schema and the constitutional validator re-check every
// output on the server and again on the device.
import { z } from 'zod'
import { ObservationalReportSchema } from './schema.ts'

const DROP = new Set([
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  '$schema',
])
const SUPPORTED_FORMATS = new Set(['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid'])

type Json = { [k: string]: unknown }

export function toModelSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toModelSchema)
  if (!node || typeof node !== 'object') return node
  const src = node as Json
  const out: Json = {}
  for (const [k, v] of Object.entries(src)) {
    if (DROP.has(k)) continue
    if (k === 'format' && typeof v === 'string' && !SUPPORTED_FORMATS.has(v)) continue
    if (k === 'prefixItems' && Array.isArray(v)) {
      // Tuples become plain arrays of the (shared) item type.
      out.items = toModelSchema(v[0])
      continue
    }
    if (k === 'items' && src.prefixItems) continue
    out[k] = toModelSchema(v)
  }
  if (out.type === 'object' || out.properties) out.additionalProperties = false
  return out
}

export function reportModelSchema(): unknown {
  return toModelSchema(z.toJSONSchema(ObservationalReportSchema, { target: 'draft-7' }))
}
