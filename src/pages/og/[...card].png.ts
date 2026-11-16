/**
 * Social preview cards, rendered once at build time: satori lays out the
 * card with the brand fonts, sharp turns the SVG into a PNG. The output is
 * a static file per card at /og/<key>.png. See src/lib/og-cards.ts for the
 * cards and how pages pick theirs.
 */
import type { APIRoute, GetStaticPaths } from "astro";
import { readFile } from "node:fs/promises";
import satori from "satori";
import sharp from "sharp";
import { decompress } from "wawoff2";
import { categoryGroups, getSortedPosts } from "../../lib/blog";
import { OG_CARDS, categoryCardKey, type OgCard } from "../../lib/og-cards";

export const getStaticPaths = (async () => {
  const categories = categoryGroups(await getSortedPosts()).map(
    (group): OgCard => ({
      key: categoryCardKey(group.slug),
      path: `/blog/category/${group.slug}/`,
      eyebrow: `Blog · ${group.category}`,
      headline: `${group.posts.length} ${group.posts.length === 1 ? "article" : "articles"} on ${group.category}, from real enterprise codebases`,
    }),
  );
  return [...OG_CARDS, ...categories].map((card) => ({
    params: { card: card.key },
    props: { card },
  }));
}) satisfies GetStaticPaths;

let fonts: Promise<Parameters<typeof satori>[1]["fonts"]> | undefined;

function loadFonts() {
  const load = async (file: string) =>
    Buffer.from(
      await decompress(await readFile(new URL(`../../../public/fonts/${file}`, import.meta.url))),
    );
  fonts ??= Promise.all([
    load("Chillax-Medium.woff2"),
    load("Chillax-Semibold.woff2"),
  ]).then(([medium, semibold]) => [
    { name: "chillax", data: medium, weight: 500 as const, style: "normal" as const },
    { name: "chillax", data: semibold, weight: 600 as const, style: "normal" as const },
  ]);
  return fonts;
}

const h = (type: string, style: Record<string, unknown>, children?: unknown) => ({
  type,
  props: { style, children },
});

export const GET: APIRoute = async ({ props }) => {
  const { card } = props as { card: OgCard };
  const headlineSize = card.headline.length > 62 ? 64 : 72;

  const svg = await satori(
    h(
      "div",
      {
        // Satori adds padding on top of a percentage size, so the frame is
        // a fixed-size child centred in the canvas instead.
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "chillax",
        color: "#e8edf6",
        backgroundColor: "#0b1220",
        backgroundImage:
          "radial-gradient(circle at 85% 10%, #1d2f4a 0%, rgba(11,18,32,0) 55%), linear-gradient(160deg, #0f1a2b 0%, #0b1220 70%)",
      },
      h("div", {
        width: 1040,
        height: 486,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }, [
        h("div", { display: "flex", flexDirection: "column" }, [
          h("div", { width: 72, height: 6, borderRadius: 3, backgroundColor: "#2f7dd1", marginBottom: 36 }),
          h(
            "div",
            { fontSize: 30, fontWeight: 500, color: "#7fb6ef", letterSpacing: 2, textTransform: "uppercase", marginBottom: 24 },
            card.eyebrow,
          ),
          h(
            "div",
            { fontSize: headlineSize, fontWeight: 600, lineHeight: 1.1, maxWidth: 1000 },
            card.headline,
          ),
        ]),
        h(
          "div",
          { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 28, fontWeight: 500 },
          [
            h("div", { fontWeight: 600, letterSpacing: 3, textTransform: "uppercase" }, "Heckers Software"),
            h("div", { color: "#9fadc4" }, "heckerssoftware.com"),
          ],
        ),
      ]),
    ) as Parameters<typeof satori>[0],
    { width: 1200, height: 630, fonts: await loadFonts() },
  );

  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png" },
  });
};
