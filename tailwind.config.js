/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#080c14',
          secondary: '#0d1117',
          card: '#111827',
          hover: '#1a2233',
        },
        border: {
          DEFAULT: '#1f2937',
          light: '#374151',
        },
        accent: {
          green: '#10b981',
          red: '#ef4444',
          blue: '#3b82f6',
          yellow: '#f59e0b',
          purple: '#8b5cf6',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      }
    },
  },
  plugins: [],
}
