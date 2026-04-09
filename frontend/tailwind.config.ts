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
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
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
        surface: "hsl(var(--surface))",
        action: {
          blue: "#3B82F6",
          gold: "#F59E0B",
          purple: "#8B5CF6",
        },
      },
      borderRadius: {
        none: "0px",
        lg: "0px",
        md: "0px",
        sm: "0px",
      },
      fontFamily: {
        sans: ['"Terminus Nerd Font"', "Terminus", "monospace"],
        pixel: ['"Terminus Nerd Font"', "Terminus", "monospace"],
      },
      boxShadow: {
        pixel: "4px 4px 0px 0px rgba(0, 0, 0, 0.4)",
        "pixel-sm": "2px 2px 0px 0px rgba(0, 0, 0, 0.4)",
        "pixel-lg": "8px 8px 0px 0px rgba(0, 0, 0, 0.4)",
        "pixel-pressed": "0px 0px 0px 0px rgba(0, 0, 0, 0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
