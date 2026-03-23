import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        jarvis: {
          bg:        '#0a0a0f',   /* Stark exact */
          surface:   '#0d1520',
          border:    '#0d2137',
          primary:   '#00d4ff',
          secondary: '#0066cc',
          accent:    '#00ff88',
          warn:      '#ff6b35',
          text:      '#c8e6f0',
          muted:     '#4a7a8a',
          glow:      '#00d4ff33',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        ui:   ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow':    'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'spin-slow':     'spin 8s linear infinite',
        'glow-pulse':    'glow-pulse 2s ease-in-out infinite',
        'scan-line':     'scan-line 4s linear infinite',
        'float':         'float 6s ease-in-out infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { opacity: '0.6', filter: 'brightness(1)' },
          '50%':       { opacity: '1',   filter: 'brightness(1.4)' },
        },
        'scan-line': {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':       { transform: 'translateY(-8px)' },
        }
      },
      boxShadow: {
        'jarvis':     '0 0 20px #00d4ff33, 0 0 60px #00d4ff11',
        'jarvis-lg':  '0 0 40px #00d4ff44, 0 0 100px #00d4ff22',
        'jarvis-red': '0 0 20px #ff6b3533, 0 0 60px #ff6b3511',
        'accent':     '0 0 20px #00ff8833',
      }
    }
  },
  plugins: []
} satisfies Config
