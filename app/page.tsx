import { redirect } from 'next/navigation'

// Root "/" always sends to /jobs (middleware ensures auth is handled first)
export default function Home() {
  redirect('/jobs')
}
