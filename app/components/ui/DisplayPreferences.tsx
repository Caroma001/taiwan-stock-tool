"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type FontScale = "xs" | "sm" | "md" | "lg" | "xl";
type Density = "compact" | "normal" | "comfortable";
type Theme = {
  page: string;
  panel: string;
  real: string;
  test: string;
  watch: string;
  accent: string;
  text: string;
  muted: string;
};

const KEY = "twstock-m89-theme";
const DISPLAY_KEY = "twstock-m89-display";
const DEFAULT_THEME: Theme = {
  page: "#020617",
  panel: "#0f172a",
  real: "#12372a",
  test: "#172554",
  watch: "#1f2937",
  accent: "#0891b2",
  text: "#e5eefc",
  muted: "#94a3b8",
};
const presets: Record<string, Theme> = {
  深夜黑: DEFAULT_THEME,
  海軍藍: {
    page: "#07111f",
    panel: "#10243d",
    real: "#173c35",
    test: "#16385f",
    watch: "#263446",
    accent: "#0ea5e9",
    text: "#edf7ff",
    muted: "#a8bfd2",
  },
  墨綠: {
    page: "#07130f",
    panel: "#10261d",
    real: "#1d4d37",
    test: "#243c53",
    watch: "#26332c",
    accent: "#14b8a6",
    text: "#edfdf7",
    muted: "#a7c7ba",
  },
  紫夜: {
    page: "#10091c",
    panel: "#24143a",
    real: "#2c4938",
    test: "#34306a",
    watch: "#372d40",
    accent: "#a855f7",
    text: "#faf5ff",
    muted: "#c4b5d4",
  },
};
const fonts: FontScale[] = ["xs", "sm", "md", "lg", "xl"];
const fontLabel: Record<FontScale, string> = {
  xs: "極小",
  sm: "小",
  md: "中",
  lg: "大",
  xl: "超大",
};
const densities: Density[] = ["compact", "normal", "comfortable"];
const densityLabel: Record<Density, string> = {
  compact: "緊密",
  normal: "標準",
  comfortable: "舒適",
};

function clampHex(hex: string) {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#334155";
}

function randomHex(min = 30, max = 115) {
  const n = () => Math.floor(min + Math.random() * (max - min));
  return `#${[n(), n(), n()]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

function randomTheme(): Theme {
  return {
    page: randomHex(4, 25),
    panel: randomHex(18, 55),
    real: randomHex(30, 90),
    test: randomHex(25, 90),
    watch: randomHex(35, 80),
    accent: randomHex(80, 205),
    text: "#f8fafc",
    muted: "#b6c2d2",
  };
}

function apply(theme: Theme, font: FontScale, density: Density) {
  const root = document.documentElement;
  root.dataset.fontScale = font;
  root.dataset.density = density;
  root.style.setProperty("--twst-theme-page", theme.page);
  root.style.setProperty("--twst-theme-panel", theme.panel);
  root.style.setProperty("--twst-theme-real", theme.real);
  root.style.setProperty("--twst-theme-test", theme.test);
  root.style.setProperty("--twst-theme-watch", theme.watch);
  root.style.setProperty("--twst-theme-accent", theme.accent);
  root.style.setProperty("--twst-theme-text", theme.text);
  root.style.setProperty("--twst-theme-muted", theme.muted);
}

export default function DisplayPreferences() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [font, setFont] = useState<FontScale>("md");
  const [density, setDensity] = useState<Density>("normal");
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    try {
      const storedTheme = localStorage.getItem(KEY);
      const storedDisplay = localStorage.getItem(DISPLAY_KEY);
      const savedTheme = storedTheme ? JSON.parse(storedTheme) : DEFAULT_THEME;
      const savedDisplay = storedDisplay ? JSON.parse(storedDisplay) : {};
      const nextFont = savedDisplay.font || "md";
      const nextDensity = savedDisplay.density || "normal";
      setTheme(savedTheme);
      setFont(nextFont);
      setDensity(nextDensity);
      setLocked(Boolean(storedTheme));
      apply(savedTheme, nextFont, nextDensity);
    } catch {
      apply(DEFAULT_THEME, "md", "normal");
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const swatches = useMemo(() => Object.entries(theme), [theme]);

  function preview(next: Theme) {
    setTheme(next);
    apply(next, font, density);
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(theme));
    localStorage.setItem(DISPLAY_KEY, JSON.stringify({ font, density }));
    setLocked(true);
    setOpen(false);
  }

  function reset() {
    setTheme(DEFAULT_THEME);
    setFont("md");
    setDensity("normal");
    localStorage.removeItem(KEY);
    localStorage.removeItem(DISPLAY_KEY);
    apply(DEFAULT_THEME, "md", "normal");
    setLocked(false);
  }

  function setDisplay(nextFont = font, nextDensity = density) {
    setFont(nextFont);
    setDensity(nextDensity);
    apply(theme, nextFont, nextDensity);
    localStorage.setItem(
      DISPLAY_KEY,
      JSON.stringify({ font: nextFont, density: nextDensity }),
    );
  }

  const modal =
    mounted && open
      ? createPortal(
          <div
            className="twst-theme-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="twst-display-title"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <section className="twst-theme-dialog">
              <header className="twst-theme-head">
                <div>
                  <small>BRUCE TWST-AI M8.9.2</small>
                  <h2 id="twst-display-title">顯示與配色設定</h2>
                  <p>即時預覽；固定後，下次開啟會保留相同設定。</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="關閉顯示與配色設定"
                >
                  ×
                </button>
              </header>

              <div className="twst-theme-body">
                <div className="twst-theme-grid">
                  <div className="twst-theme-block">
                    <h3>字體大小</h3>
                    <div className="twst-choice-row">
                      {fonts.map((value) => (
                        <button
                          type="button"
                          className={font === value ? "active" : ""}
                          onClick={() => setDisplay(value, density)}
                          key={value}
                        >
                          {fontLabel[value]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="twst-theme-block">
                    <h3>表格密度</h3>
                    <div className="twst-choice-row">
                      {densities.map((value) => (
                        <button
                          type="button"
                          className={density === value ? "active" : ""}
                          onClick={() => setDisplay(font, value)}
                          key={value}
                        >
                          {densityLabel[value]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="twst-theme-block">
                  <h3>快速主題</h3>
                  <div className="twst-choice-row">
                    {Object.entries(presets).map(([name, preset]) => (
                      <button
                        type="button"
                        onClick={() => preview(preset)}
                        key={name}
                      >
                        {name}
                      </button>
                    ))}
                    <button type="button" onClick={() => preview(randomTheme())}>
                      🎲 隨機一組
                    </button>
                  </div>
                </div>

                <div className="twst-theme-block">
                  <h3>自訂顏色</h3>
                  <div className="twst-color-grid">
                    {swatches.map(([key, value]) => (
                      <label key={key}>
                        <span>
                          {(
                            {
                              page: "頁面背景",
                              panel: "面板",
                              real: "實際持股",
                              test: "測試持股",
                              watch: "自選觀察",
                              accent: "強調色",
                              text: "主要文字",
                              muted: "次要文字",
                            } as Record<string, string>
                          )[key]}
                        </span>
                        <input
                          type="color"
                          value={clampHex(value)}
                          onChange={(event) =>
                            preview({ ...theme, [key]: event.target.value })
                          }
                        />
                        <code>{value}</code>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="twst-theme-preview">
                  <div className="real">實際持股</div>
                  <div className="test">測試持股</div>
                  <div className="watch">自選觀察</div>
                  <button type="button">推薦買進</button>
                </div>
              </div>

              <footer className="twst-theme-footer">
                <button type="button" onClick={reset}>
                  恢復預設
                </button>
                <button type="button" onClick={() => preview(randomTheme())}>
                  再隨機一次
                </button>
                <button type="button" onClick={() => setOpen(false)}>
                  暫時套用
                </button>
                <button type="button" className="primary" onClick={save}>
                  固定目前設定
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        className="twst-display-trigger"
        onClick={() => setOpen(true)}
      >
        🎨 顯示與配色{locked ? "・已固定" : ""}
      </button>
      {modal}
    </>
  );
}
