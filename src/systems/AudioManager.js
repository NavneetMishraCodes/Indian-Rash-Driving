// ============================================================
// AudioManager — pooled audio playback with preloading.
// Reuses audio elements instead of creating new ones per play.
// Supports overlapping sounds via a pool of clones.
// ============================================================

import { assetManager } from "./AssetManager.js";

class AudioManager {
  constructor() {
    this.pool = [];
    this.poolSize = 6;
    this.currentIndex = 0;
    this.unlocked = false;
    this.pendingUnlock = null;

    // Exclusive (single-instance) playback channel. Used for collision
    // sounds: only ONE collision sound may be audible at any moment.
    // A new collision immediately stops the previous one.
    this.exclusiveUrl = "";
  }

  /**
   * Preload a list of audio URLs. Resolves when all are settled.
   */
  preload(urls) {
    return assetManager.preloadAudios(urls);
  }

  /**
   * Get the next audio element from the pool.
   * Reuses existing elements to avoid repeated allocation.
   */
  getPooledAudio(url) {
    const cached = assetManager.getAudio(url);

    // Find a free slot in the pool.
    for (let i = 0; i < this.pool.length; i++) {
      const entry = this.pool[i];
      if (entry.url === url && (entry.audio.paused || entry.audio.ended)) {
        return entry.audio;
      }
    }

    // Reuse the oldest slot if the pool is full.
    if (this.pool.length >= this.poolSize) {
      const entry = this.pool[this.currentIndex % this.poolSize];
      this.currentIndex++;
      entry.url = url;
      entry.audio.src = url;
      return entry.audio;
    }

    // Create a new pooled entry.
    const audio = cached.cloneNode(true);
    audio.preload = "auto";
    this.pool.push({ url, audio });
    return audio;
  }

  /**
   * Play a sound from the pool. Handles browser autoplay restrictions
   * by deferring until the first user interaction.
   */
  play(url, volume = 1) {
    if (!this.unlocked) {
      // Deferred playback until the user interacts with the page.
      if (!this.pendingUnlock) {
        this.pendingUnlock = [];
        const unlock = () => {
          this.unlocked = true;
          if (this.pendingUnlock) {
            for (const fn of this.pendingUnlock) fn();
            this.pendingUnlock = null;
          }
          window.removeEventListener("pointerdown", unlock);
          window.removeEventListener("keydown", unlock);
          window.removeEventListener("touchstart", unlock);
        };
        window.addEventListener("pointerdown", unlock, { once: true });
        window.addEventListener("keydown", unlock, { once: true });
        window.addEventListener("touchstart", unlock, { once: true });
      }
      this.pendingUnlock.push(() => this.play(url, volume));
      return;
    }

    const audio = this.getPooledAudio(url);
    audio.volume = volume;
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Ignore playback failures (e.g. browser restrictions).
    });
  }

  /**
   * Play a sound on the single-exclusive channel (used for collision
   * sounds). Any previously playing exclusive sound is stopped IMMEDIATELY.
   *
   * Only one exclusive sound can ever be audible at once:
   *
   *   Collision 1 → sound A
   *   Collision 2 → STOP A → sound B    (A never overlaps B)
   *   Collision 3 → STOP B → sound C
   *
   * The cached element per URL comes straight from the AssetManager
   * cache (which is also what preloading fills), so the first collision
   * never triggers a network request and no per-collision Audio element
   * is ever allocated. Pausing the previously-cached element guarantees
   * the previous sound is truly stopped before the new one plays.
   *
   * Autoplay unlocking shares the same first-gesture gate as play().
   */
  playExclusive(url, volume = 1) {
    if (!this.unlocked) {
      if (!this.pendingUnlock) {
        this.pendingUnlock = [];
        const unlock = () => {
          this.unlocked = true;
          if (this.pendingUnlock) {
            for (const fn of this.pendingUnlock) fn();
            this.pendingUnlock = null;
          }
          window.removeEventListener("pointerdown", unlock);
          window.removeEventListener("keydown", unlock);
          window.removeEventListener("touchstart", unlock);
        };
        window.addEventListener("pointerdown", unlock, { once: true });
        window.addEventListener("keydown", unlock, { once: true });
        window.addEventListener("touchstart", unlock, { once: true });
      }
      this.pendingUnlock.push(() => this.playExclusive(url, volume));
      return;
    }

    // STOP the currently playing collision sound (if any) immediately.
    // We reuse the SAME cached element per URL from AssetManager, so the
    // element we paused is exactly the element that was playing. This
    // guarantees "stop previous → play new" with only one active sound.
    if (this.exclusiveUrl) {
      try {
        const prev = assetManager.getAudio(this.exclusiveUrl);
        prev.pause();
      } catch {
        // ignore
      }
    }

    // Play the cached (preloaded) element for this URL. Playback comes
    // straight out of the preload/AssetManager cache — no new Audio, no
    // new network request on first collision.
    const audio = assetManager.getAudio(url);
    audio.volume = volume;
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Ignore playback failures (e.g. browser restrictions).
    });

    this.exclusiveUrl = url;
  }
}

export const audioManager = new AudioManager();