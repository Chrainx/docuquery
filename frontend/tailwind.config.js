/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
        },
      },
      animation: {
        "slide-in":   "slideIn 0.25s ease-out",
        "fade-in":    "fadeIn 0.2s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4,0,0.6,1) infinite",
      },
      keyframes: {
        slideIn: {
          from: { opacity: "0", transform: "translateX(100%)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
      },
      backgroundImage: {
        "grid-slate": "linear-gradient(rgba(148,163,184,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.04) 1px, transparent 1px)",
      },
      backgroundSize: {
        "grid": "40px 40px",
      },
    },
  },
  plugins: [],
};
