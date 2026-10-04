import Link from 'next/link'
import type { Metadata } from 'next'
import { FormShell } from '@/components/FormShell'
import { EnrollForm } from '@/components/forms/EnrollForm'
import { listPackages, listPrograms } from '@/lib/data'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Enquire About Lessons' }

export default async function EnrollPage({ searchParams }: { searchParams: Promise<{ program?: string; package?: string }> }) {
  const [{ program, package: pkg }, programs, packages] = await Promise.all([searchParams, listPrograms(), listPackages()])
  const initialProgram = programs.some((p) => p.slug === program) ? program : undefined
  const initialPackage = packages.some((p) => p.slug === pkg) ? pkg : undefined
  return (
    <FormShell
      title="Enquire about lessons"
      intro="Tell us about the student and what they would like to learn. We will suggest a teacher and a time for a trial lesson."
      aside={
        <>
          <div className="card">
            <p className="eyebrow text-plum">Programs</p>
            <ul className="mt-3 space-y-2 text-sm">
              {programs.map((p) => (
                <li key={p.slug}><Link href={`/lessons#${p.slug}`} className="hover:text-plum">{p.name}</Link> <span className="text-muted">· {p.age_range}</span></li>
              ))}
            </ul>
          </div>
          <div className="card bg-plum-soft/50">
            <p className="text-sm text-ink-soft"><strong>Pricing</strong> for packages is being finalised. You will not be charged anything by sending this enquiry.</p>
          </div>
        </>
      }
    >
      <EnrollForm programs={programs} packages={packages} initialProgram={initialProgram} initialPackage={initialPackage} />
    </FormShell>
  )
}
