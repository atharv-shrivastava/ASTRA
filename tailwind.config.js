/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        polar: '0 12px 40px rgba(2, 132, 199, 0.08)'
      }
    }
  },
  plugins: []
}
