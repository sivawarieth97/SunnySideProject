import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      /* ============================================================
         🎨  YOUR THEME CONTROL PANEL
         Change these and the WHOLE app updates. Tweak away! 🌸
         ============================================================ */
      colors: {
        // 🌾 Warm sand — muted gold instead of candy yellow, sits quietly behind photos
        sunny: {
          50:  '#fbf7ee',
          100: '#f5ead0',
          200: '#e9d5a8',
          300: '#dbba78',
          400: '#c69a52',
        },
        // 🍑 Dusty terracotta — warm but muted, complements skin tones and wood/interiors in photos
        peachy: {
          50:  '#fbf1ea',
          100: '#f3dcc8',
          200: '#e4ba98',
          300: '#d2946a',
          400: '#b96f42',
        },
        // 🌹 Dusty rose — soft, faded pink rather than neon
        blossom: {
          50:  '#faf0ef',
          100: '#f0dad9',
          200: '#dfb7b7',
          300: '#c98d92',
          400: '#ab6670',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body:    ['var(--font-body)', 'sans-serif'],
      },
      borderRadius: {
        cute: '1.75rem',
      },
      boxShadow: {
        cute: '0 10px 30px -8px rgba(255, 122, 26, 0.35)',
      },
    },
  },
  plugins: [],
}
export default config
