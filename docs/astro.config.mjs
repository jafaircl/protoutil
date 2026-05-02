import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightBlog from "starlight-blog";
import { createStarlightTypeDocPlugin } from "starlight-typedoc";

const isDev = process.env.NODE_ENV !== "production";

const [typeDocCore, typeDocCoreSidebar] = createStarlightTypeDocPlugin();
const [typeDocCoreWkt, typeDocCoreWktSidebar] = createStarlightTypeDocPlugin();
const [typeDocCoreGoogleRpc, typeDocCoreGoogleRpcSidebar] = createStarlightTypeDocPlugin();
const [typeDocCoreGoogleType, typeDocCoreGoogleTypeSidebar] = createStarlightTypeDocPlugin();
const [typeDocAip, typeDocAipSidebar] = createStarlightTypeDocPlugin();
const [typeDocAipErrors, typeDocAipErrorsSidebar] = createStarlightTypeDocPlugin();
const [typeDocAipEtag, typeDocAipEtagSidebar] = createStarlightTypeDocPlugin();
const [typeDocAipFieldBehavior, typeDocAipFieldBehaviorSidebar] = createStarlightTypeDocPlugin();
const [typeDocAipFiltering, typeDocAipFilteringSidebar] = createStarlightTypeDocPlugin();
const [typeDocAipOrderBy, typeDocAipOrderBySidebar] = createStarlightTypeDocPlugin();
const [typeDocAipPagination, typeDocAipPaginationSidebar] = createStarlightTypeDocPlugin();
const [typeDocAipResourceName, typeDocAipResourceNameSidebar] = createStarlightTypeDocPlugin();
const [typeDocAipql, typeDocAipqlSidebar] = createStarlightTypeDocPlugin();
const [typeDocPubsub, typeDocPubsubSidebar] = createStarlightTypeDocPlugin();
const [typeDocPubsubKafka, typeDocPubsubKafkaSidebar] = createStarlightTypeDocPlugin();
const [typeDocPubsubNats, typeDocPubsubNatsSidebar] = createStarlightTypeDocPlugin();
const [typeDocPubsubRabbitMq, typeDocPubsubRabbitMqSidebar] = createStarlightTypeDocPlugin();
const [typeDocRepo, typeDocRepoSidebar] = createStarlightTypeDocPlugin();
const [typeDocRepoSqlite, typeDocRepoSqliteSidebar] = createStarlightTypeDocPlugin();
const [typeDocRepoPostgres, typeDocRepoPostgresSidebar] = createStarlightTypeDocPlugin();
const [typeDocRepoMySQL, typeDocRepoMySQLSidebar] = createStarlightTypeDocPlugin();
const [typeDocRepoMongoDB, typeDocRepoMongoDBSidebar] = createStarlightTypeDocPlugin();
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
          sidebar: { label: "core", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/core/README.md",
          },
        }),
        typeDocCoreWkt({
          entryPoints: ["../packages/core/src/wkt/index.ts"],
          tsconfig: "../packages/core/tsconfig.json",
          output: "api/core/wkt",
          sidebar: { label: "core/wkt", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
          },
        }),
        typeDocCoreGoogleRpc({
          entryPoints: ["../packages/core/src/google/rpc/index.ts"],
          tsconfig: "../packages/core/tsconfig.json",
          output: "api/core/google/rpc",
          sidebar: { label: "core/google/rpc", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
          },
        }),
        typeDocCoreGoogleType({
          entryPoints: ["../packages/core/src/google/type/index.ts"],
          tsconfig: "../packages/core/tsconfig.json",
          output: "api/core/google/type",
          sidebar: { label: "core/google/type", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
          },
        }),
        typeDocAip({
          entryPoints: ["../packages/aip/src/index.ts"],
          tsconfig: "../packages/aip/tsconfig.json",
          output: "api/aip",
          sidebar: { label: "aip", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/aip/README.md",
          },
        }),
        typeDocAipErrors({
          entryPoints: ["../packages/aip/src/errors/index.ts"],
          tsconfig: "../packages/aip/tsconfig.json",
          output: "api/aip/errors",
          sidebar: { label: "aip/errors", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/aip/src/errors/README.md",
          },
        }),
        typeDocAipEtag({
          entryPoints: ["../packages/aip/src/etag/index.ts"],
          tsconfig: "../packages/aip/tsconfig.json",
          output: "api/aip/etag",
          sidebar: { label: "aip/etag", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/aip/src/etag/README.md",
          },
        }),
        typeDocAipFieldBehavior({
          entryPoints: ["../packages/aip/src/fieldbehavior/index.ts"],
          tsconfig: "../packages/aip/tsconfig.json",
          output: "api/aip/fieldbehavior",
          sidebar: { label: "aip/fieldbehavior", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/aip/src/fieldbehavior/README.md",
          },
        }),
        typeDocAipFiltering({
          entryPoints: ["../packages/aip/src/filtering/index.ts"],
          tsconfig: "../packages/aip/tsconfig.json",
          output: "api/aip/filtering",
          sidebar: { label: "aip/filtering", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/aip/src/filtering/README.md",
          },
        }),
        typeDocAipOrderBy({
          entryPoints: ["../packages/aip/src/orderby/index.ts"],
          tsconfig: "../packages/aip/tsconfig.json",
          output: "api/aip/orderby",
          sidebar: { label: "aip/orderby", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/aip/src/orderby/README.md",
          },
        }),
        typeDocAipPagination({
          entryPoints: ["../packages/aip/src/pagination/index.ts"],
          tsconfig: "../packages/aip/tsconfig.json",
          output: "api/aip/pagination",
          sidebar: { label: "aip/pagination", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/aip/src/pagination/README.md",
          },
        }),
        typeDocAipResourceName({
          entryPoints: ["../packages/aip/src/resourcename/index.ts"],
          tsconfig: "../packages/aip/tsconfig.json",
          output: "api/aip/resourcename",
          sidebar: { label: "aip/resourcename", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/aip/src/resourcename/README.md",
          },
        }),
        typeDocAipql({
          entryPoints: ["../packages/aipql/src/index.ts"],
          tsconfig: "../packages/aipql/tsconfig.json",
          output: "api/aipql",
          sidebar: { label: "aipql", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/aipql/README.md",
          },
        }),
        typeDocPubsub({
          entryPoints: ["../packages/pubsub/src/index.ts"],
          tsconfig: "../packages/pubsub/tsconfig.json",
          output: "api/pubsub",
          sidebar: { label: "pubsub", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**", "**/*.spec.ts"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/pubsub/README.md",
          },
        }),
        typeDocPubsubKafka({
          entryPoints: ["../packages/pubsub/src/kafka/index.ts"],
          tsconfig: "../packages/pubsub/tsconfig.json",
          output: "api/pubsub/kafka",
          sidebar: { label: "pubsub/kafka", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**", "**/*.spec.ts"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/pubsub/src/kafka/README.md",
          },
        }),
        typeDocPubsubNats({
          entryPoints: ["../packages/pubsub/src/nats/index.ts"],
          tsconfig: "../packages/pubsub/tsconfig.json",
          output: "api/pubsub/nats",
          sidebar: { label: "pubsub/nats", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**", "**/*.spec.ts"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/pubsub/src/nats/README.md",
          },
        }),
        typeDocPubsubRabbitMq({
          entryPoints: ["../packages/pubsub/src/rabbitmq/index.ts"],
          tsconfig: "../packages/pubsub/tsconfig.json",
          output: "api/pubsub/rabbitmq",
          sidebar: { label: "pubsub/rabbitmq", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**", "**/*.spec.ts"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/pubsub/src/rabbitmq/README.md",
          },
        }),
        typeDocRepo({
          entryPoints: ["../packages/repo/src/index.ts"],
          tsconfig: "../packages/repo/tsconfig.json",
          output: "api/repo",
          sidebar: { label: "repo", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/repo/README.md",
          },
        }),
        typeDocRepoSqlite({
          entryPoints: ["../packages/repo/src/sqlite/index.ts"],
          tsconfig: "../packages/repo/tsconfig.json",
          output: "api/repo/sqlite",
          sidebar: { label: "repo/sqlite", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/repo/src/sqlite/README.md",
          },
        }),
        typeDocRepoPostgres({
          entryPoints: ["../packages/repo/src/postgres/index.ts"],
          tsconfig: "../packages/repo/tsconfig.json",
          output: "api/repo/postgres",
          sidebar: { label: "repo/postgres", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/repo/src/postgres/README.md",
          },
        }),
        typeDocRepoMySQL({
          entryPoints: ["../packages/repo/src/mysql/index.ts"],
          tsconfig: "../packages/repo/tsconfig.json",
          output: "api/repo/mysql",
          sidebar: { label: "repo/mysql", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/repo/src/mysql/README.md",
          },
        }),
        typeDocRepoMongoDB({
          entryPoints: ["../packages/repo/src/mongodb/index.ts"],
          tsconfig: "../packages/repo/tsconfig.json",
          output: "api/repo/mongodb",
          sidebar: { label: "repo/mongodb", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/repo/src/mongodb/README.md",
          },
        }),
        typeDocAngular({
          entryPoints: ["../packages/angular/src/public-api.ts"],
          tsconfig: "../packages/angular/tsconfig.lib.json",
          output: "api/angular",
          sidebar: { label: "angular", collapsed: true },
          watch: isDev,
          typeDoc: {
            exclude: ["**/gen/**"],
            entryFileName: "index",
            mergeReadme: true,
            readme: "../packages/angular/README.md",
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
              label: "core",
              collapsed: true,
              items: [{ label: "Overview", slug: "api/core" }],
            },
            {
              label: "aip",
              collapsed: true,
              items: [
                { label: "Overview", slug: "api/aip" },
                { label: "Filtering", slug: "api/aip/filtering" },
                { label: "Pagination", slug: "api/aip/pagination" },
                { label: "Resource Name", slug: "api/aip/resourcename" },
                { label: "ETag", slug: "api/aip/etag" },
                { label: "Errors", slug: "api/aip/errors" },
                { label: "Order By", slug: "api/aip/orderby" },
                { label: "Field Behavior", slug: "api/aip/fieldbehavior" },
              ],
            },
            {
              label: "aipql",
              collapsed: true,
              items: [{ label: "Overview", slug: "api/aipql" }],
            },
            {
              label: "pubsub",
              collapsed: true,
              items: [
                { label: "Overview", slug: "api/pubsub" },
                { label: "Kafka", slug: "api/pubsub/kafka" },
                { label: "NATS", slug: "api/pubsub/nats" },
                { label: "RabbitMQ", slug: "api/pubsub/rabbitmq" },
              ],
            },
            {
              label: "repo",
              collapsed: true,
              items: [
                { label: "Overview", slug: "api/repo" },
                { label: "SQLite", slug: "api/repo/sqlite" },
                { label: "Postgres", slug: "api/repo/postgres" },
                { label: "MySQL", slug: "api/repo/mysql" },
                { label: "MongoDB", slug: "api/repo/mongodb" },
              ],
            },

            {
              label: "angular",
              collapsed: true,
              items: [{ label: "Overview", slug: "api/angular" }],
            },
            {
              label: "protoc-gen-sql",
              collapsed: true,
              items: [{ label: "Overview", slug: "packages/protoc-gen-sql" }],
            },
          ],
        },
        {
          label: "API Reference",
          items: [
            typeDocCoreSidebar,
            typeDocCoreWktSidebar,
            typeDocCoreGoogleRpcSidebar,
            typeDocCoreGoogleTypeSidebar,
            typeDocAipSidebar,
            typeDocAipErrorsSidebar,
            typeDocAipEtagSidebar,
            typeDocAipFieldBehaviorSidebar,
            typeDocAipFilteringSidebar,
            typeDocAipOrderBySidebar,
            typeDocAipPaginationSidebar,
            typeDocAipResourceNameSidebar,
            typeDocAipqlSidebar,
            typeDocPubsubSidebar,
            typeDocPubsubKafkaSidebar,
            typeDocPubsubNatsSidebar,
            typeDocPubsubRabbitMqSidebar,
            typeDocRepoSidebar,
            typeDocRepoSqliteSidebar,
            typeDocRepoPostgresSidebar,
            typeDocRepoMySQLSidebar,
            typeDocRepoMongoDBSidebar,
            typeDocAngularSidebar,
          ],
        },
      ],
    }),
  ],
});
