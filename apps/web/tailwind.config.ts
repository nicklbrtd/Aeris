import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: 'hsl(var(--bg) / <alpha-value>)',
        surface: 'hsl(var(--surface) / <alpha-value>)',
        surfaceElevated: 'hsl(var(--surface-elevated) / <alpha-value>)',
        text: 'hsl(var(--text) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        accent: 'hsl(var(--accent) / <alpha-value>)',
        bubbleIn: 'hsl(var(--bubble-in) / <alpha-value>)',
        bubbleOut: 'hsl(var(--bubble-out) / <alpha-value>)',
      },
      boxShadow: {
        glass: '0 8px 30px rgba(0,0,0,0.35)',
      },
      borderRadius: {
        bubble: '24px',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};

export default config;
