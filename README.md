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

# Node 24 deployment-tooling unit tests
npm run deploy:compile
npm run test:deploy:unit

# Full BIP-86 sequence against pinned mainnet state (archive RPC required)
MAINNET_RPC_URL="https://your-archive-mainnet-rpc" npm run test:deploy:fork
```

Without `MAINNET_RPC_URL`, the fork command exits successfully with an explicit
skip message. A passing fork test prepares V3, upgrades the real proxy state,
recovers BOTTO to the fixed treasury, and verifies that a real remaining
staker can still withdraw all LP principal. All transactions occur only in the
ephemeral local fork.

## BIP-86 mainnet deployment

This is an upgrade of the existing transparent proxy, not a new proxy
deployment. `npx truffle migrate --network mainnet` is not a supported BIP-86
deployment path.

The tooling deliberately separates three on-chain transactions:

1. A deployer publishes the V3 implementation.
2. The ProxyAdmin owner activates V3 using the generated upgrade proposal.
3. The liquidity-mining contract owner separately recovers expired BOTTO.

Only the first transaction can be sent by repository tooling. The upgrade and
recovery scripts produce unsigned JSON transactions for external review and
execution. The recovery is irreversible and transfers the proxy's complete
BOTTO balance at execution time to
`0x35bb964878d7B6ddFA69cF0b97EE63fa3C9d9b49`.

### 1. Inspect the current deployment

Export an Ethereum mainnet RPC URL in the operator shell. Read-only commands
need no private key.

```bash
export MAINNET_RPC_URL="https://your-mainnet-rpc"
npm run deploy:inspect
```

The command must report chain ID `1`, state `v2`, proxy
`0xf8515Cae6915838543bCD7756F39268CE8F853Fd`, implementation
`0x49129912b35283DC64476641837DFE856B48Fa81`, and ProxyAdmin
`0x61b4A813Fd4e361d40339bcA4d8d4E83Be78038D`. It also checks both owner
addresses against `0xcC23e5a344EB4E99114a8F25f6037951A39AA858`.

### 2. Prepare the V3 implementation

Run the reproducible build and all validation before exposing a deployer key:

```bash
npm ci
npm run build:reproducible
npm run test:build
npm run test:all
npm run deploy:compile
npm run test:deploy:unit
MAINNET_RPC_URL="https://your-archive-mainnet-rpc" npm run test:deploy:fork
```

Then export a dedicated funded deployer key and the exact acknowledgement:

```bash
export DEPLOYER_PRIVATE_KEY="0x..."
export BOTTO_DEPLOYMENT_MODE="prepare-mainnet-v3"
npm run deploy:prepare
unset DEPLOYER_PRIVATE_KEY BOTTO_DEPLOYMENT_MODE
```

`deploy:prepare` re-runs the live guards, checks the complete Truffle V3
bytecode against the committed reproducible hashes, compares its executable
code with the Hardhat validation build, imports live V2, validates the storage
upgrade, and deploys only the V3 implementation. It does not modify the
proxy. The resulting private runtime record is written with mode `0600` to
`deployments/runtime/mainnet-v3-preparation.json` and is ignored by Git.

OpenZeppelin prints warnings for three narrowly scoped historical initializer
exceptions. They cover the already-deployed V1/V2 inheritance structure:
`missing-initializer`, `missing-initializer-call`, and
`incorrect-initializer-order`. Storage validation remains enabled; do not add
`unsafeSkipStorageCheck` or any additional exception.

### 3. Review and execute the proxy upgrade

```bash
npm run deploy:propose
```

This read-only command checks the runtime record, live V3 bytecode, proxy,
ProxyAdmin, owners, and reproducible hashes. It prints an unsigned transaction
whose target must be the fixed ProxyAdmin, value must be zero, selector must
be `0x99a88ec4`, and expected sender must be the fixed ProxyAdmin owner.

Review that JSON independently and submit it through the owner account or a
Safe. The repository does not send or sign it. After confirmation:

```bash
npm run deploy:verify
```

Verification requires the proxy to point to the recorded V3 implementation
and reads `CLAIM_DEADLINE()` and `DAO_TREASURY()` through the proxy.

### 4. Review and execute expired-reward recovery

```bash
npm run deploy:recover-proposal
```

This read-only command requires a verified V3 upgrade and a post-deadline
block. It prints an unsigned call to `recoverUnclaimedRewards()` with selector
`0xf290a618`, target equal to the liquidity-mining proxy, expected sender equal
to the contract owner, and the currently observed BOTTO balance.

Review and submit this second privileged transaction separately. Confirm on
chain that the proxy's BOTTO balance becomes zero, the fixed treasury receives
the same amount, the proxy still holds the staked LP reserve, and late stakers
can continue calling `withdraw()`.

Never commit `.env.local`, `DEPLOYER_PRIVATE_KEY`, RPC credentials, the
runtime preparation record, or a signed transaction.

## Legacy migrations

Other historical deployment flows may still use Truffle migrations where a
reviewed migration exists:

```bash
npx truffle migrate
```
