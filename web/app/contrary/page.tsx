import type { Metadata } from 'next'
import { ContraryIndex } from './contrary-index'

export const metadata: Metadata = { title: 'On the Contrary' }

export default function Page() {
  return <ContraryIndex />
}
