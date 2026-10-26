/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0d1522",
        ink2: "#3a4658",
        muted: "#6b7688",
        line: "#e5e8ee",
        brand: { DEFAULT: "#2b4bf2", ink: "#1d39c6", soft: "#eaeefe" },
        live: { DEFAULT: "#0a9d64", soft: "#e5f5ee" },
        danger: { DEFAULT: "#d4322b", soft: "#fcecea" },
        amber: { DEFAULT: "#b06a12", soft: "#fdf1df" },
      },
      fontFamily: {
        sans: ["Hanken Grotesk", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(13,21,34,.04),0 8px 24px -12px rgba(13,21,34,.12)",
        glow: "0 10px 24px -10px rgba(43,75,242,.7)",
      },
      keyframes: {
        pulse2: {
          "0%": { boxShadow: "0 0 0 0 rgba(10,157,100,.5)" },
          "70%": { boxShadow: "0 0 0 7px rgba(10,157,100,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(10,157,100,0)" },
        },
      },
      animation: { pulse2: "pulse2 1.1s infinite" },
    },
  },
  plugins: [],
};
