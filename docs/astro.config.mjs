import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightBlog from "starlight-blog";
import { createStarlightTypeDocPlugin } from "starlight-typedoc";

const isDev = process.env.NODE_ENV !== "production";

const [typeDocCore, typeDocCoreSidebar] = createStarlightTypeDocPlugin();
const [typeDocAip, typeDocAipSidebar] = createStarlightTypeDocPlugin();
const [typeDocAipql, typeDocAipqlSidebar] = createStarlightTypeDocPlugin();
const [typeDocRepo, typeDocRepoSidebar] = createStarlightTypeDocPlugin();
const [typeDocAngular, typeDocAngularSidebar] = createStarlightTypeDocPlugin();
// protoc-gen-sql is a CLI-only package (protoc plugin) with no library API.
// Its entry point calls runNodeJs() which is incompatible with TypeDoc.
// Documentation for this package comes from its README only.

export default defineConfig({
  integrations: [
    starlight({
      title: "protoutil",
      description: "TypeScript utilities for Protocol Buffers and Google AIP",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/jafaircl/protoutil",
        },
      ],
      plugins: [
        starlightBlog({ title: "Blog" }),
        typeDocCore({
          entryPoints: ["../packages/core/src/index.ts"],
          tsconfig: "../packages/core/tsconfig.json",
          output: "api/core",
          sidebar: { label: "@protoutil/core", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
          },
        }),
        typeDocAip({
          entryPoints: [
            "../packages/aip/src/index.ts",
            "../packages/aip/src/errors/index.ts",
            "../packages/aip/src/etag/index.ts",
            "../packages/aip/src/fieldbehavior/index.ts",
            "../packages/aip/src/filtering/index.ts",
            "../packages/aip/src/orderby/index.ts",
            "../packages/aip/src/pagination/index.ts",
            "../packages/aip/src/resourcename/index.ts",
          ],
          tsconfig: "../packages/aip/tsconfig.json",
          output: "api/aip",
          sidebar: { label: "@protoutil/aip", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
          },
        }),
        typeDocAipql({
          entryPoints: ["../packages/aipql/src/index.ts"],
          tsconfig: "../packages/aipql/tsconfig.json",
          output: "api/aipql",
          sidebar: { label: "@protoutil/aipql", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
          },
        }),
        typeDocRepo({
          entryPoints: ["../packages/repo/src/index.ts"],
          tsconfig: "../packages/repo/tsconfig.json",
          output: "api/repo",
          sidebar: { label: "@protoutil/repo", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
          },
        }),
        typeDocAngular({
          entryPoints: ["../packages/angular/src/public-api.ts"],
          tsconfig: "../packages/angular/tsconfig.lib.json",
          output: "api/angular",
          sidebar: { label: "@protoutil/angular", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
          },
        }),
      ],
      sidebar: [
        { label: "Home", link: "/" },
        {
          label: "Getting Started",
          items: [
            { slug: "guides/introduction" },
            { slug: "guides/installation" },
          ],
        },
        {
          label: "Packages",
          items: [
            {
              label: "@protoutil/core",
              collapsed: true,
              items: [{ slug: "packages/core" }],
            },
            {
              label: "@protoutil/aip",
              collapsed: true,
              items: [
                { slug: "packages/aip" },
                { slug: "packages/aip/filtering" },
                { slug: "packages/aip/pagination" },
                { slug: "packages/aip/resourcename" },
                { slug: "packages/aip/etag" },
                { slug: "packages/aip/errors" },
                { slug: "packages/aip/orderby" },
                { slug: "packages/aip/fieldbehavior" },
              ],
            },
            {
              label: "@protoutil/aipql",
              collapsed: true,
              items: [{ slug: "packages/aipql" }],
            },
            {
              label: "@protoutil/repo",
              collapsed: true,
              items: [
                { slug: "packages/repo" },
                { slug: "packages/repo/sqlite" },
              ],
            },
            {
              label: "@protoutil/angular",
              collapsed: true,
              items: [{ slug: "packages/angular" }],
            },
            {
              label: "@protoutil/protoc-gen-sql",
              collapsed: true,
              items: [{ slug: "packages/protoc-gen-sql" }],
            },
          ],
        },
        {
          label: "API Reference",
          items: [
            typeDocCoreSidebar,
            typeDocAipSidebar,
            typeDocAipqlSidebar,
            typeDocRepoSidebar,
            typeDocAngularSidebar,
          ],
        },
      ],
    }),
  ],
});
