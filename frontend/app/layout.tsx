import type { Metadata } from 'next'
import { Baloo_2, Nunito } from 'next/font/google'
import GoalCalendar from '@/components/GoalCalendar'
import HeaderBanner from '@/components/HeaderBanner'
import './globals.css'

const display = Baloo_2({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-display',
})
const body = Nunito({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-body',
})

export const metadata: Metadata = {
  title: 'Sunny-side ☀️',
  description: 'Plan your life, one goal at a time 💛',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
      <html lang="en" className={`${display.variable} ${body.variable}`}>
      <head>
        <link
            rel="apple-touch-icon"
            sizes="180x180"
            href="/apple-touch-icon.png?v=3"
        />
      </head>
      
      <body className="min-h-screen font-body">
        {/* dreamy floating background blobs */}
        <div className="blob -left-20 -top-16 h-72 w-72 bg-sunny-300" />
        <div className="blob -right-16 top-40 h-80 w-80 bg-blossom-200" />
        <div className="blob -bottom-20 left-1/3 h-72 w-72 bg-peachy-200" />

        <header className="relative z-10 mx-auto max-w-2xl px-3 pt-3 sm:px-6 sm:pt-5 md:max-w-3xl lg:max-w-4xl lg:px-10 xl:max-w-5xl">
          <HeaderBanner />
        </header>

        <main className="relative z-10 mx-auto mt-4 max-w-2xl px-3 pb-16 sm:mt-6 sm:px-6 md:max-w-4xl lg:max-w-6xl lg:px-10 xl:max-w-7xl 2xl:max-w-[96rem]">
          {/* On large screens the calendar is the literal "other half" — a
              sticky right column beside the page content. Stacked below on mobile. */}
          <div className="lg:flex lg:items-start lg:gap-6">
            <div className="min-w-0 flex-1">{children}</div>
            <aside className="mt-10 lg:mt-0 lg:w-[24rem] lg:shrink-0 lg:sticky lg:top-4">
              <GoalCalendar />
            </aside>
          </div>
        </main>
      </body>
    </html>
  )
}
