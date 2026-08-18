/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Design system driven by CSS variables so the
        // exact same class names flip cleanly between light and dark.
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        elevated: 'rgb(var(--elevated) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-fg': 'rgb(var(--accent-fg) / <alpha-value>)',
        // Focus indicator. Its own token because it follows the accent in
        // light and the text colour in dark — a ring is about being visible
        // against the field it surrounds, not about brand.
        ring: 'rgb(var(--ring) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Slow drift for the decorative background shapes on auth screens.
        float: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0)' },
          '50%': { transform: 'translate3d(0, -22px, 0)' },
        },
        // Light sweeping across a skeleton placeholder.
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        // Indeterminate progress bar for the full-page loader.
        progress: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(320%)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.4s ease-out',
        float: 'float 14s ease-in-out infinite',
        'float-slow': 'float 22s ease-in-out infinite',
        shimmer: 'shimmer 1.8s ease-in-out infinite',
        progress: 'progress 1.3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
