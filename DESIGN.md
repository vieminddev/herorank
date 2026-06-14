---
name: VieRank
description: Etsy SEO tools that feel like a confident, honest storefront — Starbucks-green identity, clean off-white canvas.
colors:
  starbucks-green: "#006241"
  green-accent: "#00754A"
  green-ink: "#33433d"
  gold-ceremony: "#cba258"
  off-white: "#f7f9f8"
  surface: "#ffffff"
  ink: "#1e2a26"
  muted: "#5b6b65"
  border: "#e3e8e6"
  success: "#1e8e5a"
  warning: "#b07a00"
  danger: "#c0392b"
typography:
  display:
    fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "clamp(2.5rem, 6vw, 5rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "-0.005em"
  label:
    fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.005em"
rounded:
  input: "8px"
  card: "12px"
  pill: "9999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  xxl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.green-accent}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "12px 28px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.starbucks-green}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    padding: "12px 28px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.green-accent}"
    rounded: "{rounded.pill}"
    padding: "12px 28px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.input}"
    padding: "10px 14px"
  badge-estimated:
    backgroundColor: "{colors.off-white}"
    textColor: "{colors.green-ink}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: VieRank

## 1. Overview

**Creative North Star: "The Honest Storefront"**

VieRank wears the green apron. It borrows the confidence of a flagship retail storefront — the calibrated green system, the rounded café-signage geometry, the legible-and-warm voice — and points all of it at one job: helping an Etsy seller trust what the tool tells them. The defining gesture is honesty made visible. Every estimated number wears an "Estimated" badge; nothing pretends to be ground truth. Where competitors hide their guesswork behind authoritative-looking dashboards, VieRank's surface is calm, well-spaced, and forthright. The brand's warmth comes from the green and the typography, never from a beige canvas.

This is a **product** surface, not a marketing page: design serves the task. Density is deliberate — strong visual hierarchy, one primary action per screen, generous breathing room. It should read as modern and distinct from the cluttered, number-dense tools sellers already tolerate (eRank, Marmalead), without tipping into anything playful enough to undermine trust.

It explicitly rejects: the **cream / sand / warm-neutral canvas** (the saturated AI-default of 2026), generic **SaaS / AI-slop** scaffolding (gradient text, the hero-metric template, identical card grids, tracked-uppercase eyebrows, 01/02/03 section markers, side-stripe borders), the **overwhelming number-dense dashboard**, and anything **so playful it reads as unserious**.

**Key Characteristics:**
- Starbucks-green identity carried by color + type, on a clean off-white (`#f7f9f8`) — **never** a cream/beige canvas
- Honesty as a visual system: estimates always badged, never disguised as fact
- Full-pill buttons (`9999px`), 12px cards, whisper-soft elevation — flat-plus-hint-of-lift
- One family (Inter) in calibrated weights with tight `-0.005em` tracking as the universal voice
- Strong hierarchy and white space over data density — calm, not crowded

## 2. Colors

A disciplined green system on a clean, faintly green-tinted off-white. Green carries identity; gold is reserved for ceremony; everything else stays quiet so the data reads.

### Primary
- **Storefront Green** (`#006241`): The historic brand anchor. Page-level headings (h1), primary section signals, the dominant brand moment wherever a single color must lead. Also the deep end of the green ramp for the primary-button hover state.
- **Apron Green** (`#00754A`): The brighter, more luminous action green. The primary filled-CTA fill, the floating action button, active nav indicators. This is the color that means "click me."

### Secondary
- **Ink Green** (`#33433d`): A muted slate-green for text on tinted surfaces and secondary labels — a "dustier" reading color than pure ink that quietly signals a brand surface without shouting full green.

### Tertiary
- **Ceremony Gold** (`#cba258`): Reserved exclusively for premium / upgrade / plan-status moments. Never a general-purpose accent. Its rarity is what makes "upgrade" feel like an occasion.

### Neutral
- **Off-White Canvas** (`#f7f9f8`): The page background. A true near-neutral with a hair of green chroma — warmth from the brand hue, *not* warm-by-default. Replaces the rejected cream.
- **Surface White** (`#ffffff`): Cards, inputs, sidebars — the working surfaces that lift off the canvas.
- **Ink** (`#1e2a26`): Body and heading text. Near-black with a faint green cast; ≥4.5:1 on both canvas and surface.
- **Muted Ink** (`#5b6b65`): Secondary text, captions, placeholders. Dark enough to clear 4.5:1 — never a light "elegant" gray.
- **Hairline** (`#e3e8e6`): Borders and dividers. Full borders only.

### Status
- **Success** (`#1e8e5a`), **Warning** (`#b07a00`), **Danger** (`#c0392b`): Score and state signals (high / medium / low). Always paired with a label or icon — color is never the only carrier of meaning.

### Named Rules
**The Gold-Is-Ceremony Rule.** Ceremony Gold (`#cba258`) appears *only* around premium / plan-status moments. If it shows up as a generic accent anywhere else, it's wrong.

**The No-Cream Rule.** The canvas is the off-white (`#f7f9f8`) or pure white. The warm-neutral band (cream / sand / paper / parchment, OKLCH L 0.84–0.97 C<0.06 hue 40–100) is forbidden — it's the AI-default we explicitly reject. Warmth lives in the green and the type.

## 3. Typography

**Display / Body Font:** Inter (with `"Helvetica Neue", Arial, sans-serif`) — the open substitute for Starbucks' proprietary SoDoSans.
**Accent Serif (sparingly):** Lora / Source Serif (with `Georgia` fallback) — reserved for the rare nostalgic headline moment, echoing the coffeehouse-chalkboard warmth. Optional; most surfaces are Inter only.

**Character:** One humanist-geometric sans doing nearly all the work, in calibrated weights — confident and friendly, never fashion-magazine severe. Hierarchy comes from weight and size, not from pairing two similar sans-serifs (which is banned).

### Hierarchy
- **Display** (600, `clamp(2.5rem, 6vw, 5rem)`, 1.2, `-0.01em`): Hero / landing headlines only. Ceiling stays ≤5rem — the page is designing, not shouting.
- **Headline** (600, `1.5rem`/24px, 1.4, `-0.01em`): Page titles, primary section headers — pair with Storefront Green for h1 moments.
- **Title** (600, `1.125rem`/18px, 1.4): Card titles, tool headers.
- **Body** (400, `1rem`/16px, 1.6, `-0.005em`): Default reading text. Cap measure at 65–75ch.
- **Label** (600, `0.875rem`/14px, `-0.005em`): Pill-button labels, badges, table headers. Not uppercase-tracked as a scaffold.

### Named Rules
**The One-Voice Rule.** Inter carries the system. Don't introduce a second sans to "add hierarchy" — change weight and size instead. The serif is a rare guest, not a co-host.

**The Tracking-Floor Rule.** Tighten to `-0.005em`/`-0.01em` for that confident SoDoSans-like compression, never below `-0.04em`. Letters must never touch.

## 4. Elevation

Restrained. Surfaces are flat-plus-a-hint-of-lift: cards rest nearly flat on the canvas with whisper-soft shadows, and elevation appears mostly as a response to state (hover, the floating action button, open dialogs). Depth is conveyed by the off-white-vs-white tonal step first, shadow second.

### Shadow Vocabulary
- **Card rest** (`box-shadow: 0 1px 3px rgba(30,42,38,0.06), 0 1px 2px rgba(30,42,38,0.04)`): The default whisper under content cards.
- **Card hover** (`box-shadow: 0 6px 16px rgba(30,42,38,0.10)`): A gentle lift on interactive cards (listing/shop tiles).
- **Floating action** (`box-shadow: 0 0 6px rgba(0,0,0,0.24), 0 8px 12px rgba(0,0,0,0.14)`): The layered stack under the signature floating CTA — base + ambient.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest; shadow is a response to state, not decoration. If a static card has a heavy drop shadow, it's wrong.

## 5. Components

### Buttons
- **Shape:** Full pill (`9999px` radius). Universal — every button is a pill.
- **Primary:** Apron Green (`#00754A`) fill, white label, padding `12px 28px`. The `scale(0.95)` active press is the signature micro-interaction.
- **Hover / Focus:** Deepen to Storefront Green (`#006241`); focus-visible ring in Apron Green at 40% on a 2px offset. Transitions ease-out (~180ms).
- **Secondary:** White fill, Apron Green label + `1px` Apron Green border, same pill + padding.
- **Ghost:** Transparent, Ink Green label, no border; subtle off-white wash on hover.

### Chips / Badges
- **Estimated badge:** Off-white pill, Ink Green text, `2px 8px` — the honesty marker beside every estimated number. Quiet by design; it informs, it doesn't decorate.
- **Score badge (high/medium/low):** Status color fill at low opacity + matching text, always with a text label — never color alone.

### Cards / Containers
- **Corner Style:** 12px radius.
- **Background:** Surface White on the off-white canvas (the tonal step is the primary depth cue).
- **Shadow Strategy:** Card-rest whisper at rest; Card-hover lift only on interactive tiles (see Elevation).
- **Border:** Optional `1px` Hairline (`#e3e8e6`). **No side-stripe accent borders.**
- **Internal Padding:** `24px` (md–lg). Nested cards are forbidden.

### Inputs / Fields
- **Style:** Surface White, `1px` Hairline border, `8px` radius, `10px 14px` padding.
- **Focus:** Border shifts to Apron Green + a soft Apron-Green glow ring. No layout shift.
- **Error / Disabled:** Danger border + helper text for error; reduced opacity + `not-allowed` for disabled. Placeholders use Muted Ink (≥4.5:1), never a pale gray.

### Navigation
- **Sidebar:** Surface White, quiet multi-layer shadow on the right edge. Inter labels; active item carries an Apron Green indicator + Ink text, inactive is Muted Ink. Hover lightens to an off-white wash. Mobile: collapses to a drawer.

### Signature Component — The Floating Action
A circular `56px` action button in Apron Green, bottom-right, with the layered floating shadow and `scale(0.95)` press. VieRank's adaptation of the "Frap" CTA: reserved for the single most important action on a working screen (e.g. "Analyze", "Generate"). One per screen, never more.

## 6. Do's and Don'ts

### Do:
- **Do** carry the brand with Storefront Green / Apron Green and Inter on a clean off-white (`#f7f9f8`) or white canvas.
- **Do** badge every estimated number with the "Estimated" chip — honesty is the system, per "tin cậy qua minh bạch".
- **Do** use full-pill buttons (`9999px`) with the `scale(0.95)` active press as the signature interaction.
- **Do** keep surfaces flat at rest; let shadow respond to state (hover, floating CTA, dialogs).
- **Do** lead with hierarchy and white space — one primary action per screen.
- **Do** pair status color with a label or icon (color-blind safe); placeholders and body clear 4.5:1.

### Don't:
- **Don't** use a cream / sand / beige / paper / parchment canvas — the warm-neutral AI-default is forbidden. Warmth comes from green + type.
- **Don't** ship SaaS / AI-slop: gradient text (`background-clip: text`), the hero-metric template, identical icon-heading-text card grids, tiny tracked-uppercase eyebrows on every section, `01 / 02 / 03` section markers.
- **Don't** use a `border-left` / `border-right` greater than 1px as a colored accent stripe on cards or alerts. Full borders, background tints, or leading icons instead.
- **Don't** build the overwhelming, number-dense dashboard (eRank / Marmalead) — hierarchy and breathing room over raw density.
- **Don't** tip into the over-playful: no candy colors or emoji-heavy UI that undermines a trustworthy analytics tool.
- **Don't** pair Inter with a second similar sans, or spend Ceremony Gold (`#cba258`) anywhere but premium / plan-status moments.
- **Don't** let any heading clamp exceed ~5rem or letter-spacing drop below `-0.04em`.
