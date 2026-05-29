/**
 * Curio · Design System Tokens (v3 · Doodles × Cream × Geist)
 *
 * 与 globals.css 的 @theme 块同源 —— 修改时两边同步。
 * 2026-05-29 — 全量切到奶白 + 糖果点缀 + Geist/Fraunces。
 */

export const tokens = {
  // Cream neutrals
  cream50: "#FDFAF4",
  cream100: "#F8F2E6",
  cream200: "#EFE5D0",
  cream300: "#D9CBAE",

  // Ink (深咖墨字)
  ink900: "#1A1714",
  ink700: "#4A3F35",
  ink500: "#7B6B58",
  ink300: "#B5A793",

  // Candy accents
  candyGold: "#F4A00D",
  candyGoldSoft: "#FCE5B4",
  candySky: "#81AFF8",
  candySkySoft: "#DDE9FC",
  candyCoral: "#FF8A6B",
  candyMint: "#B5E3C8",

  // Functional
  stateSuccess: "#2D7A5F",
  stateError: "#C04B2A",

  // Surfaces
  glass: "rgba(26, 23, 20, 0.04)",
  border: "rgba(122, 95, 60, 0.18)",
  borderHover: "rgba(122, 95, 60, 0.32)",

  // Radii (放大一档，doodles 圆润感)
  rXs: "6px",
  rSm: "10px",
  rMd: "14px",
  rLg: "20px",
  rXl: "28px",
  rPill: "999px",

  // Fonts
  fontSans:
    '"Geist", -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
  fontMono: '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace',
  fontSerif: '"Fraunces", "Source Serif Pro", Georgia, serif',
} as const;

export type Tokens = typeof tokens;
