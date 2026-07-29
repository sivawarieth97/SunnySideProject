'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { authHeaders } from '@/lib/auth'
import { notifyGoalsChanged } from '@/lib/goalEvents'
import { rolloverBreakdown, type RolloverSummary } from '@/lib/rollover'

// Full banner art on the home page (and auth pages, where there's little
// content); a slim strip everywhere else so the actual page content starts
// higher. Account-level actions live together in the top-right corner.

export default function HeaderBanner() {
  const pathname = usePathname()
  const router = useRouter()
  const isAuthPage = pathname === '/login' || pathname === '/register'
  const isHomePage = pathname === '/'
  const full = isHomePage || isAuthPage
  const [rollingOver, setRollingOver] = useState(false)
  const [rolloverFeedback, setRolloverFeedback] = useState('')

  async function handleRollover() {
    setRollingOver(true)
    setRolloverFeedback('')

    try {
      const response = await fetch('/api/goals/rollover', {
        method: 'POST',
        headers: authHeaders(),
      })

      if (response.status === 401) {
        router.replace('/login')
        return
      }

      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Rollover failed')

      const summary = data as RolloverSummary
      const count = summary.rolledOver ?? 0
      const breakdown = rolloverBreakdown(summary)
      setRolloverFeedback(count > 0 ? `✓ ${breakdown || `${count} moved`}` : '✓ Up to date')
      if (count > 0) notifyGoalsChanged()
    } catch {
      setRolloverFeedback('Try again')
    } finally {
      setRollingOver(false)
      window.setTimeout(() => setRolloverFeedback(''), 3000)
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
    })

    router.replace('/login')
    router.refresh()
  }

  const accountActions = !isAuthPage && (
    <div className="flex flex-col items-stretch gap-1.5">
      <button
        onClick={handleLogout}
        className="rounded-full border border-white/50 bg-black/25 px-2.5 py-1 text-[11px] font-bold
                   text-white/90 backdrop-blur transition hover:bg-black/40 sm:px-3 sm:text-xs"
      >
        Logout
      </button>
      <button
        onClick={handleRollover}
        disabled={rollingOver}
        title="Move unfinished past goals into the current period"
        className="rounded-full border border-white/50 bg-white/80 px-2.5 py-1 text-[11px] font-bold
                   text-peachy-400 backdrop-blur transition hover:bg-white disabled:opacity-60
                   sm:px-3 sm:text-xs"
      >
        {rollingOver ? '↻ Moving…' : rolloverFeedback || '↻ Rollover'}
      </button>
    </div>
  )

  if (!full) {
    return (
      <div className="relative h-20 overflow-hidden rounded-cute shadow-cute">
        <Image
          src="/fuji-header.jpg"
          alt=""
          fill
          priority
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 56rem, 72rem"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/25 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-between px-5">
          <Link href="/" className="font-display text-xl font-extrabold text-white drop-shadow-md">
            ☀️ Sunny-side
          </Link>
          {accountActions}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`relative overflow-hidden rounded-t-cute shadow-cute sm:h-64 lg:h-72
                  ${isHomePage ? 'h-36' : 'h-52'}`}
    >
      <Image
        src="/fuji-header.jpg"
        alt="Illustrated girl writing in a notebook at her desk, with a sleeping cat and a desk lamp beside her"
        fill
        priority
        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 56rem, 72rem"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
      {/* Wavy bottom edge — melts the artwork into the page background */}
      <svg
        className="absolute inset-x-0 -bottom-px h-3 w-full sm:h-6"
        viewBox="0 0 1440 54"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          fill="#faf4ee"
          d="M0,34 C180,54 360,10 540,18 C720,26 900,50 1080,40 C1260,30 1350,14 1440,26 L1440,54 L0,54 Z"
        />
      </svg>
      <div className="absolute right-3 top-3 sm:right-4 sm:top-4">{accountActions}</div>
      <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-4 text-center sm:px-5 sm:pb-8 sm:pt-5">
        <h1 className="font-display text-2xl font-extrabold text-white drop-shadow-md sm:text-3xl">
          <span className="mr-1">☀️</span>
          Sunny-side
          <span className="ml-1">🌸</span>
        </h1>
        <p
          className={`mt-1 text-sm font-semibold text-white/90 drop-shadow
                      ${isHomePage ? 'hidden sm:block' : ''}`}
        >
          Plan your life, one goal at a time ✨
        </p>
      </div>
    </div>
  )
}
