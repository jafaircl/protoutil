# Contributing to protoutil

Thank you for your interest in contributing to protoutil! This guide will help you get set up and familiar with the project workflow.

## Prerequisites

- [Node.js](https://nodejs.org/) v22+
- [pnpm](https://pnpm.io/) v10.29+
- [Buf CLI](https://buf.build/docs/installation) (for protobuf code generation)

## Getting Started

1. Fork and clone the repository:

   ```sh
   git clone https://github.com/<your-username>/protoutil.git
   cd protoutil
   ```

2. Install dependencies:

   ```sh
   pnpm install
   ```

3. Build all packages:

   ```sh
   pnpm -r run build
   ```

## Project Structure

```
packages/
  aip/             # AIP standard implementations (filtering, pagination, etc.)
  aipql/           # AIP-160 filter to SQL/MongoDB translation
  angular/         # Angular components and validators
  core/            # Core protobuf utilities
  protoc-gen-sql/  # Protoc plugin for SQL schema generation
  repo/            # Database-agnostic protobuf persistence
examples/
  fastify-server/  # Example API server
  angular-client/  # Example Angular client
docs/              # Documentation site (Astro)
```

## Development Workflow

### Running Tests

```sh
# Run tests for a specific package
pnpm --filter @protoutil/core run test

# Run tests for all packages
pnpm -r run test
```

### Linting and Formatting

This project uses [Biome](https://biomejs.dev/) for linting and formatting.

```sh
# Check and auto-fix
pnpm exec biome check --write

# Format only
pnpm exec biome format --write
```

### Protobuf Code Generation

Packages that depend on protobuf definitions use Buf for code generation. If you modify any `.proto` files, regenerate the TypeScript bindings:

```sh
# Generate for a specific package
pnpm --filter @protoutil/core run protogen

# Or via Moon
moon run core:protogen
```

### Building

Each package uses [tsdown](https://github.com/nicepkg/tsdown) to produce ESM and CJS outputs:

```sh
# Build a specific package
pnpm --filter @protoutil/core run build

# Build all packages
pnpm -r run build
```

### Moon Tasks

This project uses [Moon](https://moonrepo.dev/) as a task runner. Common tasks available per package:

```sh
moon run <package>:build
moon run <package>:test
moon run <package>:typecheck
moon run <package>:protogen
moon run <package>:check      # biome check
moon run <package>:lint       # biome lint
moon run <package>:format     # biome format
```

## Submitting Changes

1. Create a feature branch from `main`:

   ```sh
   git checkout -b feat/my-feature
   ```

2. Make your changes and ensure tests pass:

   ```sh
   pnpm -r run test
   ```

3. Add a changeset describing your change:

   ```sh
   pnpm changeset
   ```

   You will be prompted to select which packages are affected and whether the change is a patch, minor, or major bump. All `@protoutil/*` packages are versioned together, so a bump to one will bump all of them.

4. Commit your changes along with the generated changeset file (in `.changeset/`).

5. Open a pull request against `main`.

## Releasing a New Version

> Releases are handled by maintainers.

1. Ensure all changes intended for the release have been merged to `main` with their associated changesets.

2. Run the version command to consume all pending changesets, bump package versions, and update changelogs:

   ```sh
   pnpm bump
   ```

   This will:
   - Read all changeset files in `.changeset/`
   - Determine the appropriate version bump (all packages bump together)
   - Update every `package.json` version field
   - Generate/update `CHANGELOG.md` in each package
   - Delete the consumed changeset files

3. Review the version bumps and changelog entries, then commit:

   ```sh
   git add .
   git commit -m "chore(release): publish <version>"
   ```

4. Publish all packages to npm:

   ```sh
   pnpm release
   ```

   This builds every package and then runs `changeset publish`, which publishes each package to npm and creates git tags.

5. Push the commit and tags:

   ```sh
   git push --follow-tags
   ```

## Code Style

- **Formatter**: Biome with 2-space indentation, double quotes, 100-character line width
- **Language**: TypeScript (strict mode)
- **Module format**: ESM-first with CJS compatibility
- **Tests**: Vitest with `.spec.ts` file convention

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
