import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--on-primary))",
          container: "hsl(var(--primary-container))",
          "on-container": "hsl(var(--on-primary-container))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--on-secondary))",
          container: "hsl(var(--secondary-container))",
          "on-container": "hsl(var(--on-secondary-container))",
        },
        destructive: {
          DEFAULT: "hsl(var(--error))",
          foreground: "hsl(var(--on-error))",
          container: "hsl(var(--error-container))",
          "on-container": "hsl(var(--on-error-container))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          low: "hsl(var(--surface-low))",
          high: "hsl(var(--surface-high))",
          elevated: "hsl(var(--surface-elevated))",
          variant: "hsl(var(--surface-variant))",
        },
        "on-surface": "hsl(var(--on-surface))",
        "on-surface-variant": "hsl(var(--on-surface-variant))",
        "on-primary-container": "hsl(var(--on-primary-container))",
        "on-secondary-container": "hsl(var(--on-secondary-container))",
        "on-error-container": "hsl(var(--on-error-container))",
        outline: "hsl(var(--outline))",
        "outline-variant": "hsl(var(--outline-variant))",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        pixel: ["var(--font-inter)", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "9999px",
        "2xl": "1rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      boxShadow: {
        "soft": "var(--shadow-1)",
        "soft-md": "var(--shadow-2)",
        "soft-lg": "var(--shadow-3)",
      },
      transitionTimingFunction: {
        "iron": "cubic-bezier(0.2, 0, 0, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
