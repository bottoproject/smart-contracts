# BOTTO Smart Contracts

Set of Ethereum smart contracts to interact with the first decentralized autonomous artist: BOTTO

## Installation

```bash
cp .env.example .env.local
# modify vars in .env.local if required
nvm install && nvm use
npm ci
```

The repository pins Node.js 24.10.0, npm 11.6.1, Truffle 5.11.5, the full npm
dependency graph through `package-lock.json`, and the local Solidity 0.7.6
compiler. Compilation does not download a compiler at build time.

## Reproducible V3 build

```bash
npm run test:build
npm run build:reproducible
cp deployments/builds/BottoLiquidityMiningV3.json /tmp/first-build.json
npm run build:reproducible
cmp /tmp/first-build.json deployments/builds/BottoLiquidityMiningV3.json
```

The build writes the Truffle artifact to
`build/contracts/BottoLiquidityMiningV3.json` and a committed deployment
manifest to `deployments/builds/BottoLiquidityMiningV3.json`. The manifest
records the pinned toolchain, compiler settings, bytecode sizes, and SHA-256
hashes of both creation and deployed bytecode.

GitHub Actions repeats the clean build twice, compares the manifests, checks
the committed manifest, runs the complete contract test suite, and uploads
both build artifacts.

## Testing

```bash
npm run build:reproducible
npm run test:v3

# Complete historical suite
npm run test:all
```

## Migrations

```bash
npx truffle migrate
```
