'use client'

import { useActionState } from 'react'
import { submitEnroll, type FormState } from '@/app/actions'
import { Select, TextArea, TextField } from '@/components/Field'
import { FormError } from '@/components/FormError'
import { Honeypot } from '@/components/Honeypot'
import { SubmitButton } from '@/components/SubmitButton'
import { formatCents } from '@/lib/format'
import { EXPERIENCE, LESSON_FORMATS } from '@/lib/options'

type ProgramOption = { slug: string; name: string }
type PackageOption = { slug: string; name: string; lessons_count: number; lesson_minutes: number; billing: string; price_cents: number | null }

export function EnrollForm({ programs, packages, initialProgram, initialPackage }: { programs: ProgramOption[]; packages: PackageOption[]; initialProgram?: string; initialPackage?: string }) {
  const [state, action] = useActionState<FormState, FormData>(submitEnroll, null)
  const v = state?.values ?? {}
  const e = state?.errors ?? {}
  const packageOptions = [
    { value: '', label: 'Not sure yet, help me choose' },
    ...packages.map((p) => ({
      value: p.slug,
      label: `${p.name}: ${p.lessons_count} × ${p.lesson_minutes} min${p.billing === 'monthly' ? ' / month' : ''} — ${p.price_cents == null ? 'pricing to be announced' : formatCents(p.price_cents)}`,
    })),
  ]
  return (
    <form action={action} className="relative space-y-8" noValidate>
      <Honeypot />
      <FormError message={e.form} />
      <fieldset className="space-y-5">
        <legend className="eyebrow">Lessons</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Select name="program_slug" label="Program" required options={programs.map((p) => ({ value: p.slug, label: p.name }))} placeholder="Choose a program" defaultValue={v.program_slug ?? initialProgram} error={e.program_slug} />
          <Select name="package_slug" label="Package" options={packageOptions} defaultValue={v.package_slug ?? initialPackage ?? ''} error={e.package_slug} />
          <Select name="experience" label="Experience level" options={EXPERIENCE} defaultValue={v.experience ?? 'beginner'} error={e.experience} />
          <Select name="format" label="Lesson format" options={LESSON_FORMATS} defaultValue={v.format ?? 'in_person'} error={e.format} />
        </div>
        <TextArea name="availability" label="Availability" rows={2} placeholder="e.g. Weekdays after 4pm, Saturday mornings" defaultValue={v.availability} error={e.availability} />
      </fieldset>
      <fieldset className="space-y-5">
        <legend className="eyebrow">Student</legend>
        <div className="grid gap-5 sm:grid-cols-[1fr_140px]">
          <TextField name="student_name" label="Student's name" required defaultValue={v.student_name} error={e.student_name} />
          <TextField name="student_age" label="Age" inputMode="numeric" defaultValue={v.student_age} error={e.student_age} />
        </div>
        <TextArea name="notes" label="Goals or anything we should know" rows={3} placeholder="Favourite music, exams, learning needs, a piano or keyboard at home…" defaultValue={v.notes} error={e.notes} />
      </fieldset>
      <fieldset className="space-y-5">
        <legend className="eyebrow">Parent or guardian</legend>
        <TextField name="parent_name" label="Your name" required autoComplete="name" defaultValue={v.parent_name} error={e.parent_name} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="email" label="Email" type="email" required autoComplete="email" defaultValue={v.email} error={e.email} />
          <TextField name="phone" label="Phone" type="tel" required autoComplete="tel" defaultValue={v.phone} error={e.phone} />
        </div>
      </fieldset>
      <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">We reply within one business day to arrange a trial lesson.</p>
        <SubmitButton pendingText="Sending…">Send enquiry</SubmitButton>
      </div>
    </form>
  )
}
