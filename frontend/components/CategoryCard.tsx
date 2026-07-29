'use client'

import Link from 'next/link'
import Image from 'next/image'

type LinkItem = { label: string; emoji: string; href?: string; onClick?: () => void }

type Props = {
  title:       string
  emoji:       string
  gradient:    string   // tailwind "from-x to-y" classes used until a real photo is supplied
  imageSrc?:   string   // drop a real photo in /public and pass its path here to replace the placeholder
  href?:       string
  onClick?:    () => void   // use instead of href for same-page actions (e.g. setting a filter)
  links:       LinkItem[]
  comingSoon?: boolean
}

export default function CategoryCard({ title, emoji, gradient, imageSrc, href, onClick, links, comingSoon }: Props) {
  const thumb = (
    <div className={`group relative flex h-20 w-full items-end overflow-hidden rounded-2xl shadow-cute
                      sm:h-28 sm:rounded-cute
                      transition duration-300 will-change-transform
                      ${onClick || href
                        ? 'cursor-pointer touch-manipulation hover:-translate-y-1 hover:shadow-lg active:scale-[0.97] active:shadow-sm'
                        : ''}
                      ${imageSrc ? '' : `bg-gradient-to-br ${gradient}`}`}
    >
      {imageSrc && (
        <Image
          src={imageSrc} alt={title} fill
          className="object-cover transition-transform duration-500 ease-out
                     group-hover:scale-105 group-active:scale-105"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/0 to-transparent" />
      {comingSoon && (
        <span className="absolute right-2 top-2 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-bold text-peachy-400">
          Coming soon
        </span>
      )}
      <span className="relative z-10 p-2 font-display text-sm font-extrabold text-white drop-shadow sm:p-3 sm:text-base">
        {emoji} {title}
      </span>
    </div>
  )

  return (
    <div className="space-y-1.5 sm:space-y-2">
      {href ? (
        <Link href={href}>{thumb}</Link>
      ) : onClick ? (
        <button onClick={onClick} className="block w-full touch-manipulation text-left">{thumb}</button>
      ) : (
        thumb
      )}
      <ul className="space-y-1">
        {links.map(l => (
          <li key={l.label}>
            {l.href ? (
              <Link
                href={l.href}
                className="flex items-center gap-1 text-[11px] font-semibold text-[#5b3a2e]/70
                           transition hover:text-peachy-400 sm:gap-1.5 sm:text-xs"
              >
                <span>{l.emoji}</span> {l.label}
              </Link>
            ) : l.onClick ? (
              <button
                onClick={l.onClick}
                className="flex items-center gap-1 text-[11px] font-semibold text-[#5b3a2e]/70
                           transition hover:text-peachy-400 sm:gap-1.5 sm:text-xs"
              >
                <span>{l.emoji}</span> {l.label}
              </button>
            ) : (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-[#5b3a2e]/35
                               sm:gap-1.5 sm:text-xs">
                <span>{l.emoji}</span> {l.label}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
