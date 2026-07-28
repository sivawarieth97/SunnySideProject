import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Sunnyside',
        short_name: 'Sunnyside',
        description: 'Your personal life-planning app',
        start_url: '/',
        display: 'standalone',
        background_color: '#fff8e7',
        theme_color: '#f5c95d',
        icons: [
            {
                src: '/icons/sunnyside-192.png',
                sizes: '192x192',
                type: 'image/png',
            },
            {
                src: '/icons/sunnyside-512.png',
                sizes: '512x512',
                type: 'image/png',
            },
            {
                src: '/icons/sunnyside-512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any',
            },
        ],
    }
}