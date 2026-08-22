// ============================================================
// AssetManager — centralized asset loading with caching.
// Prevents duplicate network requests and repeated decoding.
// Handles both images and audio with a unified cache.
// ============================================================

class AssetManager {
  constructor() {
    this.imageCache = new Map();
    this.audioCache = new Map();
    this.pendingImages = new Map();
    this.pendingAudio = new Map();
  }

  /**
   * Get an image by URL, creating and caching it if needed.
   * Returns the Image element immediately (may not be loaded yet).
   * Multiple calls for the same URL return the same instance.
   */
  getImage(url) {
    if (this.imageCache.has(url)) {
      return this.imageCache.get(url);
    }

    const img = new Image();
    img.decoding = "async";
    img.src = url;
    this.imageCache.set(url, img);
    return img;
  }

  /**
   * Preload an image and return a promise that resolves when loaded.
   * Multiple calls for the same URL share the same promise.
   */
  preloadImage(url) {
    if (this.pendingImages.has(url)) {
      return this.pendingImages.get(url);
    }

    const img = this.getImage(url);

    const promise = new Promise((resolve, reject) => {
      if (img.complete && img.naturalWidth > 0) {
        resolve(img);
        return;
      }

      const onLoad = () => {
        cleanup();
        resolve(img);
      };

      const onError = () => {
        cleanup();
        reject(new Error(`Failed to load image: ${url}`));
      };

      const cleanup = () => {
        img.removeEventListener("load", onLoad);
        img.removeEventListener("error", onError);
      };

      img.addEventListener("load", onLoad, { once: true });
      img.addEventListener("error", onError, { once: true });
    });

    this.pendingImages.set(url, promise);
    return promise;
  }

  /**
   * Preload multiple images in parallel.
   * Returns a promise that resolves when all are settled.
   */
  preloadImages(urls) {
    return Promise.allSettled(urls.map(url => this.preloadImage(url)));
  }

  /**
   * Get a cached audio element, creating one if needed.
   */
  getAudio(url) {
    if (this.audioCache.has(url)) {
      return this.audioCache.get(url);
    }

    const audio = new Audio();
    audio.preload = "auto";
    audio.src = url;
    this.audioCache.set(url, audio);
    return audio;
  }

  /**
   * Preload an audio file and return a promise that resolves when ready.
   * Multiple calls for the same URL share the same promise.
   */
  preloadAudio(url) {
    if (this.pendingAudio.has(url)) {
      return this.pendingAudio.get(url);
    }

    const audio = this.getAudio(url);

    const promise = new Promise((resolve, reject) => {
      const onCanPlay = () => {
        cleanup();
        resolve(audio);
      };

      const onError = () => {
        cleanup();
        reject(new Error(`Failed to load audio: ${url}`));
      };

      const cleanup = () => {
        audio.removeEventListener("canplaythrough", onCanPlay);
        audio.removeEventListener("error", onError);
      };

      audio.addEventListener("canplaythrough", onCanPlay, { once: true });
      audio.addEventListener("error", onError, { once: true });
      audio.load();
    });

    this.pendingAudio.set(url, promise);
    return promise;
  }

  /**
   * Preload multiple audio files in parallel.
   */
  preloadAudios(urls) {
    return Promise.allSettled(urls.map(url => this.preloadAudio(url)));
  }

  /**
   * Preload a list of assets while limiting how many are fetched at
   * once. This prevents a long asset list (e.g. 25 collision sounds)
   * from saturating the browser's connection pool and delaying more
   * visually important assets (billboard textures).
   *
   * `loader` is a function from (url) => Promise. `limit` caps how
   * many promises are in-flight simultaneously. Failed items are
   * ignored (settled), never rejected.
   */
  preloadBatched(loader, urls, limit = 4) {
    const results = [];
    let index = 0;

    const worker = async () => {
      while (index < urls.length) {
        const i = index++;
        try {
          await loader(urls[i]);
          results[i] = { status: "fulfilled" };
        } catch {
          results[i] = { status: "rejected" };
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(limit, urls.length) },
      worker
    );

    return Promise.all(workers).then(() => results);
  }
}

export const assetManager = new AssetManager();