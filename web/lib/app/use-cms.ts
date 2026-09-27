'use client'

import * as React from 'react'
import { useApp } from '@/lib/app/context'
import { isStaff, localCms, supabaseCms, type CmsBackend } from '@/lib/content/cms'
import { supabase } from '@/lib/supabase/client'

/** The CMS backend for the current mode, and whether the user may use it. */
export function useCms(): { cms: CmsBackend | null; allowed: boolean | null } {
  const { repo, mode } = useApp()
  const [staff, setStaff] = React.useState<boolean | null>(null)
  React.useEffect(() => {
    const sb = supabase()
    if (mode === 'account' && sb) void isStaff(sb).then(setStaff)
  }, [mode])
  const allowed = mode === 'local' ? true : staff
  const cms = React.useMemo(() => {
    if (!repo) return null
    const sb = supabase()
    return mode === 'account' && sb ? supabaseCms(sb) : localCms(repo.raw)
  }, [repo, mode])
  return { cms, allowed }
}
