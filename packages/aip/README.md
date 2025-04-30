# AIP

TypeScript SDK for implementing [Google API Improvement Proposals](https://aip.dev/)
(AIP).

## Install

This package has dependencies which require adding Buf as a registry in your package manager.

- For npm, the command is `npm config set @buf:registry https://buf.build/gen/npm/v1/` or you can add this line to your .npmrc file: `@buf:registry=https://buf.build/gen/npm/v1/`
- For pnpm, the command is `pnpm config set @buf:registry https://buf.build/gen/npm/v1/`
- For yarn, the command is `yarn config set npmScopes.buf.npmRegistryServer https://buf.build/gen/npm/v1/`

See [here](https://buf.build/docs/bsr/generated-sdks/npm/) for more information.

After adding Buf as a registry, use your configured package manager to install the `@protoutil/aip` package. i.e. install from npm using `npm install @protoutil/aip`.

## Sub-Modules

- [AIP-132: Order By](src/lib/orderby/README.md)
- [AIP-158: Pagination](src/lib/pagination/README.md)
- [AIP-160: Filtering](src/lib/filtering/README.md)
- [AIP-193: Errors](src/lib/errors/README.md)
- [AIP-203: Field Behavior](src/lib/fieldbehavior/README.md)
