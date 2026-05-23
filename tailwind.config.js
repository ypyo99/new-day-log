/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        orange: {
          350: '#fca55d',
        },
        blue: {
          250: '#a5c9ff',
        }
      }
    },
  },
  plugins: [],
}
