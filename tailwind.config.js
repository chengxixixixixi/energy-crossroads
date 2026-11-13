/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)", panel: "var(--panel)", raised: "var(--raised)", line: "var(--line)", line2: "var(--line-2)",
        ink: "var(--ink)", ink2: "var(--ink-2)", ink3: "var(--ink-3)",
        amber: "var(--amber)", teal: "var(--teal)", sky: "var(--sky)",
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        cond: ["IBM Plex Sans Condensed", "IBM Plex Sans", "Arial Narrow", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
