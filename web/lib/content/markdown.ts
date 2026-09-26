// A deliberately small markdown subset for PCI texts. Blocks are numbered so
// bookmarks, highlights, notes and narration can address them.
export type Block =
  | { kind: 'h2' | 'h3' | 'p' | 'quote'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'code'; text: string }

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n')
  const out: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i++
      continue
    }
    if (line.startsWith('```')) {
      const buf: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++])
      i++
      out.push({ kind: 'code', text: buf.join('\n') })
      continue
    }
    if (line.startsWith('### ')) {
      out.push({ kind: 'h3', text: line.slice(4).trim() })
      i++
      continue
    }
    if (line.startsWith('## ')) {
      out.push({ kind: 'h2', text: line.slice(3).trim() })
      i++
      continue
    }
    if (/^[-*] /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^[-*] /.test(lines[i])) items.push(lines[i++].slice(2).trim())
      out.push({ kind: 'ul', items })
      continue
    }
    if (/^\d+\. /.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\d+\. /, '').trim())
      out.push({ kind: 'ol', items })
      continue
    }
    if (line.startsWith('> ')) {
      const buf: string[] = []
      while (i < lines.length && lines[i].startsWith('> ')) buf.push(lines[i++].slice(2))
      out.push({ kind: 'quote', text: buf.join(' ') })
      continue
    }
    const buf: string[] = []
    while (i < lines.length && lines[i].trim() && !/^(```|## |### |[-*] |\d+\. |> )/.test(lines[i])) buf.push(lines[i++].trim())
    out.push({ kind: 'p', text: buf.join(' ') })
  }
  return out
}

export function blockText(b: Block): string {
  return 'items' in b ? b.items.map(stripInline).join('. ') : stripInline(b.text)
}

/** Plain text for narration and search: glossary and link markup removed. */
export function stripInline(s: string): string {
  return s
    .replace(/\[\[([^\]|]+)\|[^\]]+\]\]/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
}

export type Inline = { kind: 'text' | 'strong' | 'em'; text: string } | { kind: 'term'; text: string; slug: string } | { kind: 'link'; text: string; href: string }

export function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ kind: 'text', text: s.slice(last, m.index) })
    if (m[1]) out.push({ kind: 'term', text: m[1], slug: (m[2] ?? m[1]).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })
    else if (m[3]) out.push({ kind: 'link', text: m[3], href: m[4] })
    else if (m[5]) out.push({ kind: 'strong', text: m[5] })
    else if (m[6]) out.push({ kind: 'em', text: m[6] })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ kind: 'text', text: s.slice(last) })
  return out
}
