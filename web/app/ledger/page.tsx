import type { Metadata } from 'next'
import { Ledger } from './ledger'

export const metadata: Metadata = { title: 'Ledger' }

export default function Page() {
  return <Ledger />
}
