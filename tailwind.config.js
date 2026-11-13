/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta institucional VIU — Clínica Oftalmológica Internacional
        brand: {
          50:  '#E8EBF3',
          100: '#C5CBE0',
          200: '#94A1CB',
          400: '#5566A6',
          // Nov-2026 · 500 y 700 se usaban (text-brand-700, ring-brand-500) sin
          // existir: el texto quedaba con el color heredado — en la fila marina
          // del Programador, el día de HOY salía blanco sobre la pastilla blanca.
          500: '#384889',
          600: '#1B2A6C',  // azul marino institucional VIU (letras del logo)
          700: '#152259',
          800: '#0F1948',
          900: '#070C28',
        },
        // Acentos del iris/sol del logo
        iris: {
          blue:  '#8FB5DA',  // rayos superiores
          green: '#95D5BD',  // rayos inferiores (mitad inferior del iris)
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
