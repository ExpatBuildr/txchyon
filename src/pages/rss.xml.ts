// src/pages/rss.xml.ts
import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ site }) => {
  if (!site) {
    return new Response("Site URL not configured", { status: 500 });
  }

  const posts = await getCollection("posts", ({ data }) => !data.draft);

  return rss({
    title: "Txchyon",
    description: "A small lab that researches crypto trading strategies and builds the software to test them. Guides and lab notes.",
    site: site,
    stylesheet: false,
    customData: `<language>en-us</language>`,
    items: posts.map((post) => {
      // FIX: Remove .md extension from post ID
      const postSlug = post.id.replace(/\.md$/, '');
      const link = new URL(`/blog/${postSlug}/`, site).href;

      return {
        title: String(post.data.title || "Untitled Post"),
        description: String(post.data.description || "New article from Txchyon"),
        link: link,
        date: new Date(post.data.date).toISOString(),
      };
    }),
  });
};