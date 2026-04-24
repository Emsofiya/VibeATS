import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VibeATS — AI-Powered CV Screening',
  description: 'Boutique talent sourcing — screen CVs intelligently.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
