/**
 * Curio · Design System Tokens
 *
 * 与 globals.css 的 @theme 块同源 —— 修改时两边同步。
 * SPEC.md § 9.2 是这套 token 的事实来源。
 */

export const tokens = {
  // Background mesh
  bgDeep: "#0a0f0c",
  bg1: "#0f1612",
  bg2: "#14211b",
  bg3: "#1e3328",

  // Cards
  card: "#16201c",
  card2: "#1a2520",
  card3: "#1f2a25",

  // Accents
  lime: "#b0f263",
  limeSoft: "rgba(176, 242, 99, 0.12)",
  forest: "#4d7a6e",

  // Text
  ink: "#ffffff",
  ink2: "#b3bab5",
  ink3: "#6b736e",
  ink4: "#4a5450",

  // Surfaces
  glass: "rgba(255, 255, 255, 0.04)",
  border: "rgba(255, 255, 255, 0.06)",

  // Radii
  rCard: "24px",
  rCardSm: "16px",
  rPill: "999px",

  // Fonts
  fontSans:
    '"Inter", -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
  fontSerif: '"Fraunces", "Times New Roman", serif',
} as const;

export type Tokens = typeof tokens;
