import type { Metadata } from 'next'
import { PageIntro } from '@/components/site/page-intro'

export const metadata: Metadata = {
  title: 'For practitioners',
  description: 'PCI can be a development tool for a practitioner. It is not a delivery system for clients.',
}

export default function Page() {
  return (
    <div>
      <PageIntro kicker="For practitioners" title="For the person whose work is other people’s material" lead="PCI can be a development tool for a practitioner. It is not a delivery system for clients." />
      <div className="site-body">
        <p>A coach, teacher, or operator may put their own residue through the seven operations: a pull to rescue, a certainty that arrived early, a week organized around someone else’s fragment. The report ends at observation. It does not say what to say next.</p>
        <p>It is not supervision. It is not client homework. It does not score empathy.</p>
        <p>The occupational test is the same as the article: has the practice kept a center of gravity, or has it evolved around fragments taken from the people who pay?</p>
      </div>
    </div>
  )
}
