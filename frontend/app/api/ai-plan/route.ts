import { NextRequest, NextResponse } from 'next/server'
import type { AIPlan, AIPlanWeek, AIPlanDay } from '@/types/aiPlan'

// Vercel: allow up to 60s for this function — Gemini takes 15–30s to write a
// full day-by-day plan, and the Hobby default timeout (~10s) would kill it.
export const maxDuration = 60

// This route lives entirely in the Next.js frontend — it never touches the
// Scala backend. It does two things for AI Mode on the Life Goal Planner page:
//  1. Runs a real Google web search for context on the stated goal (optional —
//     skipped gracefully if the search env vars aren't configured).
//  2. Asks Gemini (free tier via Google AI Studio) to turn the goal + search
//     context into a week-by-week, day-by-day plan, which the client then
//     lets the user review (and cherry-pick individual days from) before
//     creating them as real goals.

type RawSearchResult = { title: string; link: string; snippet?: string }

async function runSearch(goal: string): Promise<RawSearchResult[]> {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY
  const engineId = process.env.GOOGLE_SEARCH_ENGINE_ID
  if (!apiKey || !engineId) return []

  try {
    const q = encodeURIComponent(`${goal} study plan roadmap`)
    const res = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${engineId}&q=${q}&num=5`
    )
    if (!res.ok) return []
    const data = await res.json()
    const items = Array.isArray(data.items) ? data.items : []
    return items.slice(0, 5).map((it: any) => ({
      title:   String(it.title ?? ''),
      link:    String(it.link ?? ''),
      snippet: typeof it.snippet === 'string' ? it.snippet : undefined,
    })).filter((it: RawSearchResult) => it.title && it.link)
  } catch {
    return [] // search is a nice-to-have — never block plan generation on it
  }
}

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function clampWeeks(value: unknown): AIPlanWeek[] {
  if (!Array.isArray(value)) return []
  const weeks: AIPlanWeek[] = []
  let fallbackDay = 1

  for (const rawWeek of value.slice(0, 12)) {
    if (!rawWeek || typeof rawWeek !== 'object') continue
    const rawDays = Array.isArray((rawWeek as any).days) ? (rawWeek as any).days : []
    const days: AIPlanDay[] = []

    for (const rawDay of rawDays.slice(0, 7)) {
      if (!rawDay || typeof rawDay !== 'object') continue
      const title = str((rawDay as any).title, 120)
      const plan  = str((rawDay as any).plan, 1000)
      if (!title && !plan) continue
      const dayNum = Number((rawDay as any).day)
      days.push({
        day: Number.isInteger(dayNum) && dayNum >= 1 && dayNum <= 366 ? dayNum : fallbackDay,
        title: title || plan.slice(0, 60),
        plan:  plan || title,
        deliverable: str((rawDay as any).deliverable, 200) || null,
      })
      fallbackDay = days[days.length - 1].day + 1
    }

    const title = str((rawWeek as any).title, 120)
    if (!title && days.length === 0) continue
    weeks.push({
      title: title || `Week ${weeks.length + 1}`,
      target: str((rawWeek as any).target, 300) || null,
      days,
    })
  }
  return weeks
}

export async function POST(req: NextRequest) {
  let goal: string
  try {
    const body = await req.json()
    goal = typeof body?.goal === 'string' ? body.goal.trim() : ''
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  if (!goal) {
    return NextResponse.json({ error: 'Describe the goal you want a plan for.' }, { status: 400 })
  }

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    return NextResponse.json(
      { error: 'AI Mode is not set up yet — add GEMINI_API_KEY to frontend/.env.local and restart the dev server.' },
      { status: 500 }
    )
  }

  const searchResults = await runSearch(goal)
  const today = new Date().toISOString().slice(0, 10)

  const searchContext = searchResults.length > 0
    ? searchResults.map((s, i) => `${i + 1}. ${s.title}${s.snippet ? ' — ' + s.snippet : ''} (${s.link})`).join('\n')
    : 'No web search results available — use your own knowledge.'

  const prompt = `Today's date is ${today} (this is Day 1). A user wants a detailed goal plan for: "${goal}"

Relevant web search results:
${searchContext}

Create a week-by-week, day-by-day plan. Respond with ONLY valid JSON, exactly matching this shape:
{
  "title": "short title for the overall goal (under 60 chars)",
  "description": "one sentence on what this involves",
  "weeks": [
    {
      "title": "Week 1 — <theme of the week>",
      "target": "what the user should be capable of by the end of this week",
      "days": [
        {
          "day": 1,
          "title": "short label for the day (under 60 chars)",
          "plan": "the concrete time-blocked plan for this day, e.g. '90m: arrays and hash maps — 3 problems. 60m: review SOLID. 30m: prepare intro.'",
          "deliverable": "the tangible output of the day, e.g. 'Skills-gap list and introduction draft'"
        }
      ]
    }
  ]
}

Rules:
- "day" numbers are absolute across the whole plan and strictly increasing: Day 1 is today, week 2 starts at day 8, week 3 at day 15, and so on.
- Cover every single day of the stated timeframe (a 3-week goal = 21 days across 3 weeks). Max 7 days per week, max 12 weeks.
- Each day's "plan" should be specific and time-blocked (minutes per activity), not vague advice.
- Every day should have a concrete "deliverable" where it makes sense.
- If the goal's timeframe is longer than 12 weeks, structure the weeks as representative recurring templates and say so in the week titles.
- Keep titles under 60 characters. No markdown, no commentary — JSON only.`

  // Latest free-tier Flash model by default; override with GEMINI_MODEL in
  // .env.local if Google renames the preview or you prefer a stable ID like
  // "gemini-2.5-flash".
  const model = process.env.GEMINI_MODEL || 'gemini-3-flash-preview'

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': geminiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            // Day-by-day plans are long (up to 84 detailed day entries).
            maxOutputTokens: 16384,
            // Ask Gemini for raw JSON directly — no markdown fences to strip.
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      return NextResponse.json({ error: `AI request failed (${res.status}). ${errText}`.trim() }, { status: 502 })
    }

    const data = await res.json()
    const rawText: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    let parsed: any
    try {
      parsed = JSON.parse(rawText.trim())
    } catch {
      return NextResponse.json({ error: 'Could not parse the AI response — try rephrasing your goal.' }, { status: 502 })
    }

    const weeks = clampWeeks(parsed.weeks)
    if (weeks.length === 0) {
      return NextResponse.json({ error: 'The AI response had no usable plan — try rephrasing your goal.' }, { status: 502 })
    }

    const plan: AIPlan = {
      title: str(parsed.title, 120) || goal,
      description: str(parsed.description, 200) || null,
      weeks,
      sources: searchResults.map(s => ({ title: s.title, link: s.link })),
    }

    return NextResponse.json(plan)
  } catch {
    return NextResponse.json({ error: 'Could not reach the AI service.' }, { status: 502 })
  }
}
