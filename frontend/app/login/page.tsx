'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { setToken } from '@/lib/auth'
import Link from 'next/link'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (res.ok) {
        setToken(data.token)
        router.push('/')
      } else {
        setError(data.error ?? 'Login failed')
      }
    } catch {
      setError('Could not reach the server')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full rounded-2xl border border-sunny-200 bg-sunny-50 px-3 py-2.5 text-sm font-semibold ' +
    'text-[#5b3a2e] outline-none transition focus:border-peachy-300 focus:ring-4 focus:ring-peachy-100'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto mt-12 max-w-sm rounded-cute border border-white bg-white/70 p-7 shadow-cute backdrop-blur"
    >
      <h2 className="font-display text-2xl font-extrabold text-peachy-400">Welcome back 🌸</h2>
      <p className="mb-7 text-sm font-semibold text-blossom-300">So happy to see you again ✨</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-bold text-blossom-300">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-bold text-blossom-300">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            className={inputClass}
          />
        </div>

        {error && <p className="text-sm font-semibold text-blossom-400">{error}</p>}

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-gradient-to-r from-peachy-300 to-blossom-300
                     py-3 font-display text-base font-bold text-white shadow-cute disabled:opacity-40"
        >
          {loading ? 'Signing in... 💫' : '🔑 Sign in'}
        </motion.button>
      </form>

      <p className="mt-6 text-center text-sm font-semibold text-blossom-300">
        No account?{' '}
        <Link href="/register" className="font-bold text-peachy-400 hover:underline">
          Register 🎀
        </Link>
      </p>
    </motion.div>
  )
}
