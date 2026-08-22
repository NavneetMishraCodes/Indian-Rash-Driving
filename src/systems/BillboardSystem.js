// ============================================================
// BillboardSystem — framed billboard rendering with aspect-ratio
// preservation, shared texture caching, and preloading.
//
// Design notes:
//   * Every billboard image goes through the shared AssetManager,
//     so repeated billboards reuse the same decoded texture.
//   * The board is sized from the source image's aspect ratio so
//     portrait photos stay portrait and landscape photos stay
//     landscape. Images are never stretched or cropped by default.
//   * The frame/backing is a physical-looking structure drawn
//     around the image so the photo feels attached to a board.
//   * All dimensions are driven by the caller-provided scene scale
//     (s), which already encodes world-space perspective.
// ============================================================

import { assetManager } from "./AssetManager.js";

const TAU = Math.PI * 2;

// Extreme aspect ratios are clamped so a 20:1 panorama or a 1:20
// portrait still reads as a plausible board (never a razor strip).
const MIN_ASPECT = 0.5;
const MAX_ASPECT = 2.6;

const DEFAULT_ASPECT = 1.6;

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

class BillboardSystem {
  constructor() {
    this.base = "";
  }

  setBase(url) {
    this.base = url;
  }

  url(filename) {
    if (!filename) return "";
    return `${this.base}${filename}`;
  }

  /** Return the shared (cached) texture for a billboard image. */
  getTexture(filename) {
    return filename ? assetManager.getImage(this.url(filename)) : null;
  }

  /** Preload all billboard images through the shared cache. */
  preload(filenames) {
    return assetManager.preloadImages(
      filenames.map((f) => this.url(f))
    );
  }

  /**
   * Draw one billboard.
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x           Ground anchor x (screen)
   * @param {number} y           Ground anchor y (screen)
   * @param {number} s           Scene scale at this depth
   * @param {number} side        -1 = left, 1 = right (kept for API parity)
   * @param {string}  filename   Billboard image filename (cached)
   */
  draw(ctx, x, y, s, side, filename) {
    const img = this.getTexture(filename);

    // Source aspect ratio — default to landscape while the image loads.
    const imgAspect =
      img && img.complete && img.naturalWidth > 0
        ? img.naturalWidth / img.naturalHeight
        : DEFAULT_ASPECT;

    const aspect = clamp(imgAspect, MIN_ASPECT, MAX_ASPECT);

    // Board footprint. `s` is the scene scale at this depth (≈1.0
    // near the player, where a car is ~100–120px wide). A real Indian
    // highway hoarding should read as a LARGE roadside structure —
    // roughly 2.5–3× a car's width — so the photo/content is clearly
    // recognizable as the player approaches and passes.
    //
    // The panel's base dimension is its width; height follows the
    // source aspect ratio, so portrait photos produce tall boards.
    // Extreme aspect ratios are clamped to a plausible board (never a
    // razor strip) and the board keeps a sane physical maximum so it
    // never covers the whole screen.
    const boardS = s;

    let panelW = 300 * boardS;
    let panelH = panelW / aspect;

    // Physical size guard regardless of the source image's resolution
    // or aspect. Max keeps the board a hoarding (not a skyscraper);
    // min keeps even a tiny square image from becoming invisible.
    const maxBoardW = 380 * boardS;
    const minBoardW = 110 * boardS;
    if (panelW > maxBoardW) {
      panelW = maxBoardW;
      panelH = panelW / aspect;
    } else if (panelW < minBoardW) {
      panelW = minBoardW;
      panelH = panelW / aspect;
    }

    const pad = 2.5 * s;
    const frameW = panelW + pad * 2;
    const frameH = panelH + pad * 2;
    const poleH = Math.max(8 * s, panelH * 0.18);

    // Ground shadow
    ctx.fillStyle = "rgba(0,0,0,.16)";
    ctx.beginPath();
    ctx.ellipse(
      x,
      y + 2 * s,
      frameW * 0.55,
      5 * s,
      0,
      0,
      TAU
    );
    ctx.fill();

    // Support poles
    const legW = Math.max(1.5, 2.2 * s);
    ctx.fillStyle = "#4a5058";
    ctx.fillRect(
      x - frameW * 0.42 - legW / 2,
      y - poleH,
      legW,
      poleH
    );
    ctx.fillRect(
      x + frameW * 0.42 - legW / 2,
      y - poleH,
      legW,
      poleH
    );

    // Mounting collar
    if (poleH > 0) {
      ctx.fillStyle = "#5b636c";
      ctx.fillRect(
        x - frameW * 0.34,
        y - poleH,
        frameW * 0.68,
        Math.max(1.5, 3 * s)
      );
    }

    // Dark outer frame (physical backing)
    const frameTop = y - poleH - frameH;
    ctx.fillStyle = "#1f2226";
    ctx.fillRect(
      x - frameW / 2,
      frameTop,
      frameW,
      frameH
    );

    // Light inner panel behind the photo
    ctx.fillStyle = "#e9e6da";
    ctx.fillRect(
      x - panelW / 2,
      y - poleH - panelH,
      panelW,
      panelH
    );

    // Photo — always fits entirely inside the panel (contain).
    // Important content is never cropped and never stretched.
    if (img && img.complete && img.naturalWidth > 0) {
      const fitAspect = img.naturalWidth / img.naturalHeight;
      let fitW = panelW;
      let fitH = panelW / fitAspect;
      if (fitH > panelH) {
        fitH = panelH;
        fitW = panelH * fitAspect;
      }
      const dx = x - fitW / 2;
      const dy = y - poleH - panelH + (panelH - fitH) / 2;
      ctx.drawImage(img, dx, dy, fitW, fitH);
    }

    // Painted white border over the photo so it reads as a poster
    ctx.strokeStyle = "rgba(255,255,255,.85)";
    ctx.lineWidth = Math.max(0.75, 0.8 * s);
    ctx.strokeRect(
      x - panelW / 2,
      y - poleH - panelH,
      panelW,
      panelH
    );
  }
}

export const billboardSystem = new BillboardSystem();