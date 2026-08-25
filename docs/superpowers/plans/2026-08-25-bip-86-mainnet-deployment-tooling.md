# BIP-86 Mainnet Deployment Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Node 24 Hardhat workflow that safely prepares, proposes, and verifies the BIP-86 V2-to-V3 mainnet upgrade without automatically submitting either privileged transaction.

**Architecture:** Keep the existing CommonJS Truffle project authoritative for compilation and historical tests, and isolate Hardhat 3 in an ESM npm workspace under `deployment/`. A pure safety library owns the fixed deployment baseline, bytecode checks, state classification, runtime records, and transaction proposals; thin Hardhat scripts provide network and OpenZeppelin integration.

**Tech Stack:** Node 24.10.0, npm 11.6.1 workspaces, Hardhat 3.14.0, `@openzeppelin/hardhat-upgrades` 4.1.0, `@nomicfoundation/hardhat-ethers` 4.0.15, ethers 6.17.0, Solidity 0.7.6, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-25-bip-86-mainnet-deployment-tooling-design.md`

## Global Constraints

- Truffle's reproducible Solidity `0.7.6` output remains authoritative.
- Every Hardhat V3 deployment bytecode must match `deployments/builds/BottoLiquidityMiningV3.json` before broadcast.
- Mainnet chain ID must equal `1`; fixed proxy, V2, ProxyAdmin, owner, token, treasury, and deadline values cannot be overridden.
- Only `deploy:prepare` may broadcast, and only with `BOTTO_DEPLOYMENT_MODE=prepare-mainnet-v3` plus a deployer key.
- Upgrade and recovery commands only emit transaction proposals; they never request a signer or send a transaction.
- Secrets and full RPC URLs never appear in output or runtime records.

---

### Task 1: Isolated Hardhat 3 workspace and bytecode gate

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `deployment/package.json`
- Create: `deployment/hardhat.config.ts`
- Create: `deployment/lib/artifact.js`
- Create: `deployment/test/unit/artifact.test.js`

**Interfaces:**
- Produces: `loadReproducibleBuild(rootDir) -> BuildManifest`
- Produces: `assertMatchingV3Bytecode(buildManifest, hardhatArtifact) -> { creationSha256, deployedSha256 }`
- Consumes: `deployments/builds/BottoLiquidityMiningV3.json` and Hardhat's V3 artifact.

- [ ] **Step 1: Write failing bytecode-gate tests**

Create fixtures with literal SHA-256 values and test that matching creation and deployed bytecode passes, while either mismatch throws an error naming the mismatched hash. The expectation must be hand-derived rather than computed with the production helper.

```js
test("rejects Hardhat deployed bytecode that differs from the reproducible build", () => {
  assert.throws(
    () => assertMatchingV3Bytecode(manifest, { bytecode: "0x00", deployedBytecode: "0x01" }),
    /deployed bytecode hash mismatch/
  );
});
```

- [ ] **Step 2: Run the unit test and verify RED**

Run: `node --test deployment/test/unit/artifact.test.js`

Expected: failure because `deployment/lib/artifact.js` does not exist.

- [ ] **Step 3: Implement the isolated workspace and minimal bytecode gate**

Pin the workspace dependencies exactly and configure Solidity `0.7.6`, optimizer runs `200`, EVM `istanbul`, source path `../contracts`, and workspace-local artifacts/cache. Normalize optional `0x` prefixes before hashing raw bytes.

```js
export function sha256Bytecode(bytecode) {
  const normalized = bytecode.startsWith("0x") ? bytecode.slice(2) : bytecode;
  return createHash("sha256").update(Buffer.from(normalized, "hex")).digest("hex");
}
```

- [ ] **Step 4: Install from the lockfile and verify GREEN**

Run: `npm install --package-lock-only && npm ci && npm run build:reproducible && npm run deploy:compile && npm run test:deploy:unit`

Expected: Hardhat compilation succeeds under Node 24 and the artifact tests pass.

- [ ] **Step 5: Commit the workspace boundary**

```bash
git add package.json package-lock.json deployment/package.json deployment/hardhat.config.ts deployment/lib/artifact.js deployment/test/unit/artifact.test.js
git commit -m "build: add isolated Hardhat 3 deployment workspace"
```

### Task 2: Fixed baseline and read-only state inspection

**Files:**
- Create: `deployment/lib/baseline.js`
- Create: `deployment/lib/inspect.js`
- Create: `deployment/scripts/inspect.js`
- Create: `deployment/test/unit/inspect.test.js`

**Interfaces:**
- Produces: immutable `BASELINE` addresses, chain ID, deadline, and EIP-1967 slots.
- Produces: `inspectDeployment(provider, expectedImplementation?) -> Inspection`.
- Produces: `classifyImplementation(observed, prepared?) -> "v2" | "prepared" | "upgraded"` or throws for an unknown implementation.

- [ ] **Step 1: Write failing inspection tests**

Use an in-memory EIP-1193 test provider with complete literal RPC responses. Test the valid V2 state plus wrong chain, missing code, wrong admin, wrong owner, and unknown implementation. Assert on the consumer-visible error and inspection result, not on calls to the fake provider.

```js
test("rejects a proxy controlled by an unexpected ProxyAdmin", async () => {
  await assert.rejects(
    inspectDeployment(providerWith({ proxyAdmin: OTHER_ADDRESS })),
    /ProxyAdmin mismatch/
  );
});
```

- [ ] **Step 2: Run inspection tests and verify RED**

Run: `node --test deployment/test/unit/inspect.test.js`

Expected: failure because the inspection module does not exist.

- [ ] **Step 3: Implement the baseline and inspector**

Use ethers `getStorage`, `getCode`, and contract calls with minimal ABI fragments. Compare addresses with checksum-insensitive normalization and include expected/observed values in every invariant failure. `scripts/inspect.js` obtains one Hardhat connection, calls the inspector, and prints sanitized JSON.

- [ ] **Step 4: Run inspection unit tests and a live read-only inspection**

Run: `npm run test:deploy:unit`

Run with a read-only RPC: `MAINNET_RPC_URL=<url> npm run deploy:inspect`

Expected: unit tests pass; live output reports chain 1, V2, the fixed ProxyAdmin, and both fixed owners without printing the RPC URL.

- [ ] **Step 5: Commit inspection tooling**

```bash
git add deployment/lib/baseline.js deployment/lib/inspect.js deployment/scripts/inspect.js deployment/test/unit/inspect.test.js package.json
git commit -m "feat: add guarded BIP-86 deployment inspection"
```

### Task 3: Runtime record and unsigned transaction proposals

**Files:**
- Modify: `.gitignore`
- Create: `deployment/lib/record.js`
- Create: `deployment/lib/proposals.js`
- Create: `deployment/scripts/propose.js`
- Create: `deployment/scripts/verify.js`
- Create: `deployment/scripts/recover-proposal.js`
- Create: `deployment/test/unit/record.test.js`
- Create: `deployment/test/unit/proposals.test.js`

**Interfaces:**
- Produces: `validatePreparationRecord(value) -> PreparationRecord`.
- Produces: `buildUpgradeProposal(newImplementation) -> TransactionProposal`.
- Produces: `buildRecoveryProposal({ bottoBalance }) -> TransactionProposal`.
- Consumes: inspection and artifact hashes from Tasks 1 and 2.

- [ ] **Step 1: Write failing record and proposal tests**

Test rejection of wrong chain/address, zero or malformed implementations, absent hashes, and secret-like fields. Assert the exact literal target, zero value, function selectors, expected sender, treasury, and amount for valid proposals.

```js
test("builds an unsigned ProxyAdmin upgrade proposal", () => {
  const proposal = buildUpgradeProposal(NEW_IMPLEMENTATION);
  assert.equal(proposal.to, "0x61b4A813Fd4e361d40339bcA4d8d4E83Be78038D");
  assert.equal(proposal.value, "0");
  assert.equal(proposal.expectedSender, "0xcC23e5a344EB4E99114a8F25f6037951A39AA858");
  assert.match(proposal.data, /^0x99a88ec4/);
});
```

- [ ] **Step 2: Run proposal tests and verify RED**

Run: `node --test deployment/test/unit/record.test.js deployment/test/unit/proposals.test.js`

Expected: failure because the modules do not exist.

- [ ] **Step 3: Implement strict records and pure proposal builders**

Encode `upgrade(address,address)` and `recoverUnclaimedRewards()` with ethers `Interface`. Reject unknown keys named like `key`, `secret`, `mnemonic`, `rpc`, or `url` before writing records. Ignore `deployments/runtime/` in Git.

- [ ] **Step 4: Implement read-only proposal and verification scripts**

Each script loads and validates the runtime record before connecting, reuses `inspectDeployment`, verifies live bytecode hashes, and prints JSON. The recovery script additionally checks the latest timestamp is greater than `1774915199` and reads `balanceOf(proxy)` from the fixed BOTTO token.

- [ ] **Step 5: Verify GREEN and mutation coverage**

Run: `npm run test:deploy:unit`

Temporarily mutate the expected ProxyAdmin and upgrade selector one at a time; confirm the relevant test fails, then restore each mutation and rerun the suite.

- [ ] **Step 6: Commit unsigned proposal tooling**

```bash
git add .gitignore deployment/lib/record.js deployment/lib/proposals.js deployment/scripts/propose.js deployment/scripts/verify.js deployment/scripts/recover-proposal.js deployment/test/unit/record.test.js deployment/test/unit/proposals.test.js package.json
git commit -m "feat: generate guarded BIP-86 transaction proposals"
```

### Task 4: OpenZeppelin preparation command

**Files:**
- Create: `deployment/lib/prepare.js`
- Create: `deployment/scripts/prepare.js`
- Create: `deployment/test/unit/prepare.test.js`
- Modify: `.env.example`

**Interfaces:**
- Produces: `assertPreparationAuthorized(env, chainId) -> void`.
- Produces: `prepareUpgrade({ hre, connection, outputPath }) -> PreparationRecord`.
- Consumes: `inspectDeployment`, `assertMatchingV3Bytecode`, `buildUpgradeProposal`, and record writer.

- [ ] **Step 1: Write failing authorization tests**

Test missing acknowledgement, wrong acknowledgement, wrong chain, absent deployer key, and the valid combination. Verify failures occur before any signer or network deployment operation can be invoked.

```js
test("refuses preparation without the exact mainnet acknowledgement", () => {
  assert.throws(
    () => assertPreparationAuthorized({ DEPLOYER_PRIVATE_KEY: VALID_KEY }, 1n),
    /BOTTO_DEPLOYMENT_MODE=prepare-mainnet-v3/
  );
});
```

- [ ] **Step 2: Run preparation tests and verify RED**

Run: `node --test deployment/test/unit/prepare.test.js`

Expected: failure because the preparation module does not exist.

- [ ] **Step 3: Implement authorization before signer creation**

Validate environment and chain first. Then compare artifacts, inspect the exact V2 state, create the V2 and V3 factories, call `forceImport(proxy, V2, { kind: "transparent" })`, and call `prepareUpgrade(proxy, V3, { kind: "transparent", getTxResponse: true })`. Resolve the new implementation and deployment transaction, re-check deployed bytecode, and atomically write the runtime record with file mode `0600`.

- [ ] **Step 4: Add safe environment documentation**

Add `MAINNET_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, and `BOTTO_DEPLOYMENT_MODE` placeholders to `.env.example`, explicitly noting that production secrets must not be committed and that only the prepare command reads the deployer key.

- [ ] **Step 5: Verify GREEN without broadcasting**

Run: `npm run test:deploy:unit && npm run deploy:compile`

Expected: all unit tests and compilation pass. Do not run `deploy:prepare` against mainnet during implementation.

- [ ] **Step 6: Commit preparation tooling**

```bash
git add deployment/lib/prepare.js deployment/scripts/prepare.js deployment/test/unit/prepare.test.js .env.example package.json
git commit -m "feat: prepare BIP-86 implementation deployment safely"
```

### Task 5: Mainnet-fork operational test

**Files:**
- Create: `deployment/test/fork/bip86-upgrade.test.js`
- Create: `deployment/lib/fork-staker.js`
- Create: `deployment/test/unit/fork-staker.test.js`
- Modify: `deployment/hardhat.config.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `findStakerWithPosition(provider, fromBlock, toBlock) -> address`.
- Consumes: fixed baseline, proposal builders, Hardhat upgrades API, and live proxy state.

- [ ] **Step 1: Write failing event-selection tests**

Use literal Stake and Withdraw log fixtures to prove the selector searches newest-to-oldest, ignores malformed logs, and returns only a user whose `totalUserStake(address)` is non-zero at the pinned block.

- [ ] **Step 2: Run the selector test and verify RED**

Run: `node --test deployment/test/unit/fork-staker.test.js`

Expected: failure because the selector module does not exist.

- [ ] **Step 3: Implement bounded staker discovery**

Query `Stake(address,uint256)` logs in provider-compatible block windows, newest first, deduplicate candidate addresses, and confirm each candidate with `totalUserStake(address)`. Fail clearly if no active staker is found.

- [ ] **Step 4: Write the fork test before the fork implementation hook**

The test records the chosen staker's LP position and treasury/proxy BOTTO balances, prepares V3, executes the generated ProxyAdmin proposal through an impersonated owner, verifies constants and preserved state, executes recovery, and finally impersonates the staker to withdraw the exact recorded LP principal. It must assert reward is zero and LP is preserved.

- [ ] **Step 5: Run the fork test and verify RED**

Run: `MAINNET_RPC_URL=<archive-url> npm run test:deploy:fork`

Expected: failure until the pinned fork network and impersonation/funding helpers are configured.

- [ ] **Step 6: Configure and complete the pinned fork**

Pin the fork to the implementation-time mainnet block recorded in the test, keep the manifest under `.openzeppelin/tests` via `MANIFEST_DEFAULT_DIR`, and add an explicit skip with a visible reason when `MAINNET_RPC_URL` is absent.

- [ ] **Step 7: Verify GREEN on the archive fork**

Run: `MAINNET_RPC_URL=<archive-url> npm run test:deploy:fork`

Expected: the V2-to-V3 upgrade, recovery, and late LP withdrawal all pass on the pinned mainnet state.

- [ ] **Step 8: Commit the fork test**

```bash
git add deployment/lib/fork-staker.js deployment/test/unit/fork-staker.test.js deployment/test/fork/bip86-upgrade.test.js deployment/hardhat.config.ts package.json
git commit -m "test: simulate BIP-86 upgrade on a mainnet fork"
```

### Task 6: Operator documentation and complete verification

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-25-bip-86-mainnet-deployment-tooling-design.md` only if implementation discovers an approved design correction.

**Interfaces:**
- Documents: exact local validation, inspect, prepare, propose, verify, and recovery-proposal sequence.

- [ ] **Step 1: Document the operational runbook**

Explain required environment variables, read-only versus broadcasting commands, runtime record handling, human review of generated JSON, the two separately signed privileged transactions, and post-transaction checks. State that `truffle migrate --network mainnet` is unsupported for BIP-86.

- [ ] **Step 2: Run the complete reproducible build and local suites**

Run: `npm ci && npm run build:reproducible && npm run test:build && npm run test:all && npm run deploy:compile && npm run test:deploy:unit`

Expected: reproducible build succeeds, 272 historical tests pass, Hardhat compiles V3 with matching hashes, and all deployment unit tests pass.

- [ ] **Step 3: Run the fork suite when an archive RPC is available**

Run: `MAINNET_RPC_URL=<archive-url> npm run test:deploy:fork`

Expected: complete fork sequence passes. If no archive RPC is available, record that limitation explicitly; do not describe the mainnet workflow as deployment-ready.

- [ ] **Step 4: Inspect the final diff and secrets**

Run: `git diff --check && git status --short && git diff --stat && git grep -nE "(PRIVATE KEY-----|[A-Fa-f0-9]{64})" -- ':!package-lock.json' ':!.env.example'`

Expected: no whitespace errors, no unexpected files, and no production secret material.

- [ ] **Step 5: Commit the runbook**

```bash
git add README.md docs/superpowers/specs/2026-08-25-bip-86-mainnet-deployment-tooling-design.md
git commit -m "docs: add BIP-86 mainnet upgrade runbook"
```

- [ ] **Step 6: Push the completed commits to the PR branch**

Run: `git push origin HEAD:bip-86-liquidity-mining-recovery`

Expected: the remote PR head matches local HEAD. No mainnet deployment, upgrade, or recovery transaction has been submitted.
