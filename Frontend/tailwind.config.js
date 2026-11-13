/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        deep: '#051F20',
        forest: '#0B2B26',
        teal: '#163832',
        soft: '#235347',
        light: '#8EB69B',
        mint: '#DAF1DE',
        page: '#F3FAF5',
        line: '#DDE9E0',
        ink: '#0F2A24',
        muted: '#5B7168',
      },
      fontFamily: { sans: ['var(--font-poppins)', 'system-ui', 'sans-serif'] },
      borderRadius: { xl: '12px', '2xl': '16px' },
      boxShadow: {
        card: '0 1px 2px rgba(5,31,32,0.04), 0 4px 16px rgba(5,31,32,0.05)',
        pop: '0 10px 40px rgba(5,31,32,0.18)',
      },
    },
  },
  plugins: [],
};
