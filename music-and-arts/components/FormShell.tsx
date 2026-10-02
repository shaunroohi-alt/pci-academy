import type { ReactNode } from 'react'

export function FormShell({ title, intro, aside, children }: { title: string; intro: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="container-x py-12 sm:py-16">
      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <div>
          <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-2xl text-muted">{intro}</p>
          <div className="card mt-8">{children}</div>
        </div>
        {aside && <aside className="space-y-4 lg:pt-20">{aside}</aside>}
      </div>
    </div>
  )
}
