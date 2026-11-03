import sharpService from "astro/assets/services/sharp";

/**
 * Astro's default image service, with animated GIFs passed through as they
 * are. The default service re-encodes a GIF frame by frame (into animated
 * WebP), and a screen recording of a few hundred frames blows past sharp's
 * pixel limit and fails the build. Serving the original file keeps the
 * animation, the hashed filename and the width/height attributes; it just
 * skips the transform, the same way the base service already skips SVGs.
 */
export default {
  ...sharpService,

  validateOptions(options, config) {
    const validated = sharpService.validateOptions(options, config);
    if (typeof validated.src === "object" && validated.src.format === "gif") {
      validated.format = "gif";
    }
    return validated;
  },

  async transform(inputBuffer, transformOptions, config) {
    if (transformOptions.format === "gif") {
      return { data: inputBuffer, format: "gif" };
    }
    return sharpService.transform(inputBuffer, transformOptions, config);
  },
};
