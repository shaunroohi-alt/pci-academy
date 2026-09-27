'use client'

import * as React from 'react'
import type { GraphEdge, GraphNode } from '@/lib/relational/graph'
import { formatDate } from '@/lib/utils'

const LANES: GraphNode['kind'][] = ['observation', 'journal', 'ledger', 'contrary']
const LANE_LABEL: Record<GraphNode['kind'], string> = { observation: 'Observations', journal: 'Journal', ledger: 'Ledger', contrary: 'On the Contrary' }
const EDGE_STYLE: Partial<Record<GraphEdge['type'], { stroke: string; dash?: string }>> = {
  REPEATS: { stroke: 'var(--ink)' },
  RELATED_TO: { stroke: 'var(--muted)', dash: '3 3' },
  CONTRADICTS: { stroke: 'var(--danger)' },
  REFERENCES: { stroke: 'var(--accent)' },
  EXPANDS: { stroke: 'var(--ep-inference)' },
}

/** Timeline of material with visible relationships drawn as arcs. */
export function Timeline({ nodes, edges, onSelect, selected }: { nodes: GraphNode[]; edges: GraphEdge[]; onSelect: (id: string) => void; selected: string | null }) {
  const W = 960
  const laneH = 56
  const H = LANES.length * laneH + 40
  const times = nodes.map((n) => new Date(n.date).getTime())
  const min = Math.min(...times)
  const max = Math.max(...times)
  const x = (d: string) => 120 + ((new Date(d).getTime() - min) / Math.max(1, max - min)) * (W - 150)
  const y = (k: GraphNode['kind']) => 30 + LANES.indexOf(k) * laneH
  const pos = new Map(nodes.map((n) => [n.id, { x: x(n.date), y: y(n.kind) }]))
  const drawn = edges.filter((e) => EDGE_STYLE[e.type])

  return (
    <figure className="overflow-x-auto rounded-[4px] border border-line bg-raised">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px]" role="img" aria-label="Timeline of your material and the relationships between items">
        {LANES.map((k) => (
          <g key={k}>
            <line x1={110} x2={W - 20} y1={y(k)} y2={y(k)} stroke="var(--line)" />
            <text x={10} y={y(k) + 4} fontSize={11} fill="var(--muted)" fontFamily="var(--font-sans)">
              {LANE_LABEL[k]}
            </text>
          </g>
        ))}
        {drawn.map((e) => {
          const a = pos.get(e.from)
          const b = pos.get(e.to)
          if (!a || !b) return null
          const mx = (a.x + b.x) / 2
          const my = Math.min(a.y, b.y) - 18 - Math.abs(a.x - b.x) * 0.08
          const st = EDGE_STYLE[e.type]!
          const hot = selected && (e.from === selected || e.to === selected)
          return <path key={e.id} d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`} fill="none" stroke={st.stroke} strokeDasharray={st.dash} strokeWidth={hot ? 2 : 1} opacity={selected && !hot ? 0.15 : 0.7} />
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id)!
          const on = selected === n.id
          return (
            <g key={n.id} tabIndex={0} role="button" aria-label={`${LANE_LABEL[n.kind]}: ${n.title}, ${formatDate(n.date)}`} onClick={() => onSelect(n.id)} onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onSelect(n.id)} className="cursor-pointer focus:outline-none">
              <circle cx={p.x} cy={p.y} r={on ? 7 : 5} fill={on ? 'var(--accent)' : 'var(--bg)'} stroke="var(--ink)" strokeWidth={1.5} />
            </g>
          )
        })}
      </svg>
      <figcaption className="flex flex-wrap gap-4 border-t border-line px-4 py-2 text-[11px] text-muted">
        <span>— Repeats</span>
        <span>┄ Related (shared wording)</span>
        <span className="text-danger">— Contradicts</span>
        <span className="text-accent">— Your links</span>
        <span>Edges record visible relationships, not causes.</span>
      </figcaption>
    </figure>
  )
}
