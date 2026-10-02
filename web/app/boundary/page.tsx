import type { Metadata } from 'next'
import { BoundaryList } from '@/components/site/boundary-list'
import { PageIntro } from '@/components/site/page-intro'

export const metadata: Metadata = {
  title: 'Boundary',
  description: 'What this is not. Not therapy, diagnosis, or crisis care. Not a personality test.',
}

export default function Page() {
  return (
    <div>
      <PageIntro kicker="Boundary" title="What this is not" />
      <BoundaryList />
      <div className="site-body mt-12">
        <p>Harm is not recast as a gift. Creator is not culprit. Visibility of a need is not an obligation to act on it.</p>
        <p>If someone is in immediate danger, this site is the wrong room.</p>
      </div>
    </div>
  )
}
