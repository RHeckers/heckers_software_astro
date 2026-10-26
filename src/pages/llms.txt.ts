import type { APIRoute } from "astro";
import { llmsIndex, postSummaries } from "../lib/llms";

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL("https://heckerssoftware.com");
  return new Response(llmsIndex(base, await postSummaries(base)), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
