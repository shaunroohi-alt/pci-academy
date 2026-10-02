import type { Metadata } from 'next'
import { OperationRow } from '@/components/site/operation-row'
import { PageIntro } from '@/components/site/page-intro'
import { OPERATIONS } from '@/content/site'

export const metadata: Metadata = {
  title: 'Method',
  description: 'Seven operations. Then stop. These are the only operations the method runs.',
}

export default function Page() {
  return (
    <div>
      <PageIntro title="Seven operations. Then stop." lead="These are the only operations the method runs." />
      <ol aria-label="Operations" className="border-b border-line">
        {OPERATIONS.map((op) => (
          <OperationRow key={op.n} n={op.n} name={op.name} q={op.q} />
        ))}
      </ol>
      <p className="mt-12 font-display text-[32px] text-ink">Then stop.</p>
      <div className="site-body mt-8">
        <p>A question layer exists only after interest is shown. Questions come from the material just given. They do not choose a path.</p>
      </div>
    </div>
  )
}
