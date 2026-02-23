import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        void: '#050505',
        panel: '#0a0a0a',
        hover: '#141414',
        active: '#1a1a1a',
        'line-subtle': '#333',
        'line-faint': '#222',
        copper: '#D99E6B',
        rose: '#CD5C5C',
        'text-bright': '#fff',
        'text-main': '#e0e0e0',
        'text-dim': '#666',
      },
      fontFamily: {
        mono: ['SF Mono', 'Menlo', 'Monaco', 'monospace'],
        ui: ['system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
