import { visit } from "unist-util-visit";

/**
 * Opens links that leave the site in a new tab. A link is external when
 * its href is absolute and points at another host; links to this site,
 * relative links, anchors and mailto/tel links are left alone. `noopener`
 * keeps the new page from reaching back into this one, `noreferrer`
 * keeps the article URL out of the other site's logs.
 *
 * @param {{ site: string }} options The site's own origin, e.g. from
 *   astro.config's `site`, so links back to it stay in the same tab.
 */
export default function rehypeExternalLinks({ site }) {
  const own = new URL(site).hostname;

  return (tree) => {
    visit(tree, "element", (node) => {
      if (node.tagName !== "a") return;
      const href = node.properties?.href;
      if (typeof href !== "string" || !/^https?:\/\//i.test(href)) return;

      let host;
      try {
        host = new URL(href).hostname;
      } catch {
        return;
      }
      if (host === own || host.endsWith(`.${own}`)) return;

      node.properties.target = "_blank";
      const rel = new Set(
        Array.isArray(node.properties.rel)
          ? node.properties.rel
          : String(node.properties.rel ?? "").split(/\s+/).filter(Boolean),
      );
      rel.add("noopener");
      rel.add("noreferrer");
      node.properties.rel = [...rel];
    });
  };
}
