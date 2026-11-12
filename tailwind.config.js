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
          600: '#1B2A6C',  // azul marino institucional VIU (letras del logo)
          800: '#0F1948',
          900: '#070C28',
        },
        // Acentos del iris/sol del logo
        // Nov-2026 · tonos para las "tabletas" clínicas (fondos suaves con el
        // texto en el mismo tono). DEFAULT sigue siendo el color del logo.
        iris: {
          blue: {
            DEFAULT: '#8FB5DA',  // rayos superiores
            50:  '#EEF4FA',
            100: '#DAE7F4',
            200: '#BCD3EA',
            700: '#2E5C8A',
            800: '#22476C',
          },
          green: {
            DEFAULT: '#95D5BD',  // rayos inferiores (mitad inferior del iris)
            50:  '#ECF8F3',
            100: '#D5F0E5',
            200: '#B4E3D1',
            700: '#2A7A5E',
            800: '#1F5E48',
          },
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
