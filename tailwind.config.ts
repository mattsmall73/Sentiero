import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#fbfbfd",
        ink: "#2a2522",
        muted: "#6e6263",
        faint: "#8a7e76",
        rose: {
          solid: "#a07242",
          deep: "#8a6845",
          soft: "#f5ebe0",
        },
        cream: "#faf6f1",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        serif: ["Fraunces", "Georgia", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
