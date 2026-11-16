/**
 * Makes the versions of the client logos that stand on a dark ground
 * (src/assets/logos/on-dark/), used by components/LogoBanner.astro.
 *
 * Seven brands in seven colours do not sit well on dark blue, and their
 * dark lettering disappears on it. This redraws each logo as one light
 * shape: every inked or coloured pixel becomes the same soft white, and
 * whatever was white inside the logo (an emblem on a coloured block,
 * letters in a coloured circle) is cut out, so the band shows through and
 * the detail stays readable. Transparency is kept, so edges stay smooth.
 *
 * Run it again after adding or replacing a logo:
 *   node scripts/make-on-dark-logos.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "src/assets/logos");
const out = path.join(dir, "on-dark");

const LOGOS = [
  "vattenfall_logo.svg",
  "marel_logo.svg",
  "spacewell_logo.png",
  "ministerie_van_defensie_logo.png",
  "phitaal_logo.png",
  "wgk-antwerpen.svg",
  "dh_automation_logo.svg",
];

/** Height of the generated images, in pixels: about three times the size
 *  they are shown at, so they stay sharp on dense screens. */
const HEIGHT = 200;

/** The one tone every logo is drawn in: the site's text colour on dark. */
const TONE = [232, 237, 246];

fs.mkdirSync(out, { recursive: true });

for (const file of LOGOS) {
  const { data, info } = await sharp(path.join(dir, file), { density: 400 })
    .resize({ height: HEIGHT })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    /* How far the pixel is from white, judged by its weakest channel:
       white is 0, any ink or saturated colour (yellow included, whose
       blue channel is empty) is close to 1. That becomes its opacity, so
       white areas are cut out and everything else is solid. */
    const whiteness = Math.min(data[i], data[i + 1], data[i + 2]) / 255;
    const solid = Math.min(1, (1 - whiteness) * 1.8);
    /* Then keep the drawing inside a mark: a bright colour (yellow,
       orange) is drawn fainter than a dark one (navy, black), so two
       colours that touch, such as the halves of a roundel or letters on a
       disc, stay two tones instead of merging into one blob. */
    const luminance =
      (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    const ink = solid * (0.42 + 0.58 * (1 - luminance));
    data[i] = TONE[0];
    data[i + 1] = TONE[1];
    data[i + 2] = TONE[2];
    data[i + 3] = Math.round(data[i + 3] * ink);
  }

  const name = file.replace(/\.(svg|png)$/, ".png");
  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9 })
    .toFile(path.join(out, name));
  console.log(`${name}  ${info.width}x${info.height}`);
}
