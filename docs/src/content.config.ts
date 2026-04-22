import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { blogSchema } from "starlight-blog/schema";

const docsGlob = glob({
  base: "./src/content/docs",
  pattern: [
    "index.mdx",
    "guides/**/*.{md,mdx}",
    "api/**/index.md",
    "api/**/globals.md",
    "api/**/modules.md",
    "api/**/classes/*.md",
    "api/**/functions/*.md",
    "api/**/interfaces/*.md",
    "api/**/type-aliases/*.md",
    "api/**/variables/*.md",
  ],
});

const protocGenSqlReadmePath = fileURLToPath(
  new URL("../../packages/protoc-gen-sql/README.md", import.meta.url),
);

function getDescription(markdown) {
  const lines = markdown.split(/\r?\n/);
  let seenHeading = false;
  const parts = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (parts.length > 0) break;
      continue;
    }

    if (trimmed.startsWith("#")) {
      seenHeading = true;
      continue;
    }

    if (!seenHeading) continue;
    parts.push(trimmed);
  }

  return parts.join(" ");
}

export const collections = {
  docs: defineCollection({
    loader: {
      name: "protoutil-docs-loader",
      async load(context) {
        await docsGlob.load(context);

        const body = readFileSync(protocGenSqlReadmePath, "utf8");
        const filePath = path.relative(
          fileURLToPath(context.config.root),
          protocGenSqlReadmePath,
        );
        const data = await context.parseData({
          id: "packages/protoc-gen-sql",
          data: {
            description: getDescription(body),
            editUrl: false,
            title: "@protoutil/protoc-gen-sql",
          },
          filePath: protocGenSqlReadmePath,
        });
        const rendered = await context.renderMarkdown(body, {
          fileURL: pathToFileURL(protocGenSqlReadmePath),
        });

        context.store.set({
          body,
          data,
          digest: context.generateDigest(body),
          filePath,
          id: "packages/protoc-gen-sql",
          rendered,
        });
      },
    },
    schema: docsSchema({
      extend: (context) => blogSchema(context),
    }),
  }),
};
