'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { getToken, clearToken } from '@/lib/auth'

// Full banner art on the home page (and auth pages, where there's little
// content); a slim strip everywhere else so the actual page content starts
// higher. Logout lives here in the corner — it's a rare action and doesn't
// deserve equal weight with New Goal / Rollover in the side panel.

export default function HeaderBanner() {
  const pathname = usePathname()
  const router = useRouter()
  const isAuthPage = pathname === '/login' || pathname === '/register'
  const full = pathname === '/' || isAuthPage

  // Token lives in localStorage — only readable after mount (avoids hydration mismatch).
  const [hasToken, setHasToken] = useState(false)
  useEffect(() => { setHasToken(!!getToken()) }, [pathname])

  function handleLogout() {
    clearToken()
    setHasToken(false)
    router.replace('/login')
  }

  const logoutButton = hasToken && !isAuthPage && (
    <button
      onClick={handleLogout}
      className="rounded-full border border-white/50 bg-black/25 px-3 py-1 text-xs font-bold
                 text-white/90 backdrop-blur transition hover:bg-black/40"
    >
      Logout
    </button>
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
          {logoutButton}
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-52 overflow-hidden rounded-t-cute shadow-cute sm:h-64 lg:h-72">
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
        className="absolute inset-x-0 -bottom-px h-6 w-full"
        viewBox="0 0 1440 54"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          fill="#faf4ee"
          d="M0,34 C180,54 360,10 540,18 C720,26 900,50 1080,40 C1260,30 1350,14 1440,26 L1440,54 L0,54 Z"
        />
      </svg>
      <div className="absolute right-4 top-4">{logoutButton}</div>
      <div className="absolute inset-x-0 bottom-0 px-5 pb-8 pt-5 text-center">
        <h1 className="font-display text-3xl font-extrabold text-white drop-shadow-md">
          <span className="mr-1">☀️</span>
          Sunny-side
          <span className="ml-1">🌸</span>
        </h1>
        <p className="mt-1 text-sm font-semibold text-white/90 drop-shadow">
          Plan your life, one goal at a time ✨
        </p>
      </div>
    </div>
  )
}
