"use client";
import { useEffect, useState } from "react";
import { Moon } from "lucide-react";
export function ThemeSwitch() {
  const [theme, setTheme] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("fusion-atlas-theme");
      setTheme(
        ["dark", "light", "system"].includes(saved || "") ? saved : "dark",
      );
    } catch {
      setTheme("dark");
    }
  }, []);
  useEffect(() => {
    if (!theme) return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  return (
    <label className="theme-switch">
      <Moon size={15} />
      <span className="sr-only">Color theme</span>
      <select
        aria-label="Color theme"
        value={theme || "dark"}
        onChange={(e) => {
          const value = e.target.value;
          setTheme(value);
          try {
            localStorage.setItem("fusion-atlas-theme", value);
          } catch {}
        }}
      >
        <option value="dark">Dark</option>
        <option value="light">Light</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
