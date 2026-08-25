# BIP-86 Liquidity Mining Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the undeployed liquidity-mining V3 with a storage-compatible V2 upgrade that sends expired BOTTO rewards only to the DAO treasury while keeping every staker's LP principal withdrawable.

**Architecture:** V3 overrides `withdraw` to preserve normal behavior through the deadline and forfeit only rewards afterward. A parameterless recovery function transfers the entire BOTTO balance to the fixed treasury, while generic rescue rejects BOTTO and continues protecting staked LP. The inherited reward-closing helper becomes `internal` so V3 can reuse V2 accounting without changing storage.

**Tech Stack:** Solidity 0.7.6, OpenZeppelin Contracts 3.4, OpenZeppelin Truffle Upgrades 1.5, Truffle, Mocha/Chai, OpenZeppelin Test Helpers

**Spec:** `docs/superpowers/specs/2026-08-25-bip-86-liquidity-mining-recovery-design.md`

## Global Constraints

- Upgrade path is deployed `BottoLiquidityMiningV2` directly to rewritten `BottoLiquidityMiningV3`.
- Do not add, remove, reorder, or change the type of any V1/V2 storage variable.
- `CLAIM_DEADLINE` is `1774915199` (March 30, 2026 23:59:59 UTC).
- `DAO_TREASURY` is `0x35bb964878d7B6ddFA69cF0b97EE63fa3C9d9b49`.
- Only BOTTO rewards go to the treasury; staked BOTTO-ETH UNI-V2 remains withdrawable.
- Do not deploy, upgrade, sign, or submit any mainnet transaction.

---

### Task 1: Specify the V3 Behavior with Failing Tests

**Files:**
- Create: `test/BottoLiquidityMiningV3.test.js`
- Create: `contracts/mocks/MockBottoLiquidityMiningV3.sol`
- Test: `test/BottoLiquidityMiningV3.test.js`

**Interfaces:**
- Consumes: V1 proxy state, `BottoLiquidityMiningV2`, current undeployed `BottoLiquidityMiningV3`
- Produces: executable requirements for `CLAIM_DEADLINE()`, `DAO_TREASURY()`, `recoverUnclaimedRewards()`, overridden `withdraw()`, and overridden `rescueTokens(address,address,uint256)`

- [ ] **Step 1: Build a V2-to-V3 upgrade fixture**

Create a test fixture that deploys BOTTO and mock LP tokens, deploys V1 behind a proxy, deposits rewards, creates two staker positions, upgrades to V2, and finally upgrades to V3. Because the fixed deadline is already in the past, use the real V3 for post-deadline tests and a test-only V3 subclass with an appended mock-deadline storage slot for boundary/pre-deadline tests.

```javascript
const CLAIM_DEADLINE = toBN("1774915199");
const DAO_TREASURY = "0x35bb964878d7B6ddFA69cF0b97EE63fa3C9d9b49";

this.miningProxy = await deployProxy(BottoLiquidityMining, [
  this.bottoEth.address,
  this.botto.address,
]);
await this.botto.transfer(this.miningProxy.address, totalRewards);
await this.miningProxy.deposit(totalRewards, start, end);
// Stake from two users, upgrade to V2, then upgrade to V3.
this.miningProxy = await upgradeProxy(
  this.miningProxy.address,
  BottoLiquidityMiningV2
);
this.miningProxy = await upgradeProxy(
  this.miningProxy.address,
  BottoLiquidityMiningV3
);
```

The test-only subclass overrides an internal deadline accessor and does not
participate in production deployment:

```solidity
contract MockBottoLiquidityMiningV3 is BottoLiquidityMiningV3 {
    uint256 private _mockClaimDeadline;

    function setMockClaimDeadline(uint256 deadline) public {
        _mockClaimDeadline = deadline;
    }

    function _claimDeadline()
        internal
        view
        virtual
        override
        returns (uint256)
    {
        return _mockClaimDeadline;
    }
}
```

- [ ] **Step 2: Add deadline and authorization recovery tests**

Add individual tests proving:

```javascript
expect(await this.miningProxy.CLAIM_DEADLINE()).to.be.bignumber.equal(
  CLAIM_DEADLINE
);
expect(await this.miningProxy.DAO_TREASURY()).to.equal(DAO_TREASURY);
await expectRevert(
  this.miningProxy.recoverUnclaimedRewards({ from: staker1 }),
  "Ownable: caller is not the owner"
);
await expectRevert(
  this.miningProxy.recoverUnclaimedRewards({ from: owner }),
  "LiquidityMiningV3::recoverUnclaimedRewards: claim period active"
);
```

- [ ] **Step 3: Add full-balance treasury recovery tests**

After advancing one second beyond the deadline, assert that recovery transfers the entire BOTTO balance to the fixed treasury, emits `UnclaimedRewardsRecovered`, leaves LP balance and `totalStake()` unchanged, rejects a zero-balance recovery, and allows later-arriving BOTTO to be recovered only through the same fixed-destination function.

```javascript
const recovered = await this.botto.balanceOf(this.miningProxy.address);
const treasuryBefore = await this.botto.balanceOf(DAO_TREASURY);
const tx = await this.miningProxy.recoverUnclaimedRewards({ from: owner });
expectEvent(tx, "UnclaimedRewardsRecovered", {
  treasury: DAO_TREASURY,
  amount: recovered,
});
expect(await this.botto.balanceOf(this.miningProxy.address)).to.be.bignumber.equal("0");
expect(await this.botto.balanceOf(DAO_TREASURY)).to.be.bignumber.equal(
  treasuryBefore.add(recovered)
);
```

- [ ] **Step 4: Add post-deadline LP-only withdrawal tests**

Recover BOTTO first, then withdraw as each staker. Assert zero returned/paid reward, complete LP return, `RewardsForfeited` and `Withdraw` events, unchanged claimed-reward totals, correct stake counters, and second-withdraw rejection.

```javascript
const result = await this.miningProxy.withdraw.call({ from: staker1 });
expect(result.reward).to.be.bignumber.equal("0");
const tx = await this.miningProxy.withdraw({ from: staker1 });
expectEvent(tx, "RewardsForfeited", { staker: staker1 });
expectEvent(tx, "Withdraw", {
  staker: staker1,
  bottoEthOut: staker1Stake,
});
expect(await this.bottoEth.balanceOf(staker1)).to.be.bignumber.equal(staker1Stake);
```

- [ ] **Step 5: Add pre-deadline compatibility and generic-rescue tests**

Assert that withdrawal at the deadline still pays BOTTO and updates claimed accounting. Separately assert generic BOTTO rescue always reverts, staked LP cannot be rescued, excess LP can be rescued, unrelated ERC-20 rescue remains available to the owner, and non-owner calls revert.

```javascript
await expectRevert(
  this.miningProxy.rescueTokens(this.botto.address, owner, "1"),
  "LiquidityMiningV3::rescueTokens: use recoverUnclaimedRewards"
);
await expectRevert(
  this.miningProxy.rescueTokens(this.bottoEth.address, owner, "1"),
  "LiquidityMiningV3::rescueTokens: that BottoEth belongs to stakers"
);
```

- [ ] **Step 6: Run the V3 test and verify RED**

Run:

```bash
npx truffle test test/BottoLiquidityMiningV3.test.js
```

Expected: FAIL because the existing V3 lacks the constants and `recoverUnclaimedRewards`, and its current reward/rescue behavior contradicts BIP-86. Fix only test setup errors until failures are caused by missing production behavior.

- [ ] **Step 7: Commit the failing specification tests**

```bash
git add test/BottoLiquidityMiningV3.test.js contracts/mocks/MockBottoLiquidityMiningV3.sol
git commit -m "test: specify BIP-86 liquidity mining recovery"
```

### Task 2: Implement the Storage-Compatible V3 Upgrade

**Files:**
- Modify: `contracts/BottoLiquidityMining.sol`
- Replace: `contracts/BottoLiquidityMiningV3.sol`
- Consume: `contracts/mocks/MockBottoLiquidityMiningV3.sol`
- Test: `test/BottoLiquidityMiningV3.test.js`

**Interfaces:**
- Consumes: inherited `update`, `_applyReward(address)`, token addresses, stake totals, claimed-reward mappings, and existing events
- Produces: `CLAIM_DEADLINE()`, `DAO_TREASURY()`, `recoverUnclaimedRewards()`, `UnclaimedRewardsRecovered`, `RewardsForfeited`, BIP-86-aware `withdraw`, and restricted `rescueTokens`

- [ ] **Step 1: Expose the inherited position-closing helper without changing storage**

Change only the function visibility:

```solidity
function _applyReward(address account)
    internal
    returns (uint256 bottoEthOut, uint256 reward)
```

Do not change any state declaration or calculation inside the function.

- [ ] **Step 2: Replace the undeployed V3 constants and events**

```solidity
uint256 public constant CLAIM_DEADLINE = 1774915199;
address public constant DAO_TREASURY =
    0x35bb964878d7B6ddFA69cF0b97EE63fa3C9d9b49;

event UnclaimedRewardsRecovered(address indexed treasury, uint256 amount);
event RewardsForfeited(address indexed staker, uint256 amount);

function _claimDeadline() internal view virtual returns (uint256) {
    return CLAIM_DEADLINE;
}
```

Remove the undeployed `terminate` behavior and its events.

- [ ] **Step 3: Implement the BIP-86-aware withdrawal**

Override the complete V2 withdrawal flow so it uses one `update nonReentrant` boundary and never nests reentrancy guards:

```solidity
function withdraw()
    public
    virtual
    override
    update
    nonReentrant
    returns (uint256 bottoEthOut, uint256 reward)
{
    totalStakers = totalStakers.sub(1);
    uint256 calculatedReward;
    (bottoEthOut, calculatedReward) = _applyReward(msg.sender);

    if (bottoEthOut > 0) {
        bottoEth.safeTransfer(msg.sender, bottoEthOut);
    }

    if (block.timestamp <= _claimDeadline()) {
        reward = calculatedReward;
        if (reward > 0) {
            botto.safeTransfer(msg.sender, reward);
            userClaimedRewards[msg.sender] = userClaimedRewards[msg.sender].add(reward);
            totalClaimedRewards = totalClaimedRewards.add(reward);
            emit Payout(msg.sender, reward);
        }
    } else {
        reward = 0;
        emit RewardsForfeited(msg.sender, calculatedReward);
    }

    emit Withdraw(msg.sender, bottoEthOut);
}
```

- [ ] **Step 4: Implement treasury-only full BOTTO recovery**

```solidity
function recoverUnclaimedRewards() public onlyOwner nonReentrant {
    require(
        block.timestamp > _claimDeadline(),
        "LiquidityMiningV3::recoverUnclaimedRewards: claim period active"
    );
    uint256 amount = IERC20(botto).balanceOf(address(this));
    require(
        amount > 0,
        "LiquidityMiningV3::recoverUnclaimedRewards: no BOTTO to recover"
    );
    botto.safeTransfer(DAO_TREASURY, amount);
    emit UnclaimedRewardsRecovered(DAO_TREASURY, amount);
}
```

- [ ] **Step 5: Implement generic rescue without a BOTTO bypass**

```solidity
function rescueTokens(
    address tokenToRescue,
    address to,
    uint256 amount
) public virtual override onlyOwner nonReentrant {
    require(
        tokenToRescue != botto,
        "LiquidityMiningV3::rescueTokens: use recoverUnclaimedRewards"
    );
    if (tokenToRescue == bottoEth) {
        require(
            amount <= IERC20(bottoEth).balanceOf(address(this)).sub(totalStake()),
            "LiquidityMiningV3::rescueTokens: that BottoEth belongs to stakers"
        );
    }
    tokenToRescue.safeTransfer(to, amount);
}
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```bash
npx truffle test test/BottoLiquidityMiningV3.test.js
```

Expected: all V3 behavior tests PASS.

- [ ] **Step 7: Commit the implementation**

```bash
git add contracts/BottoLiquidityMining.sol contracts/BottoLiquidityMiningV3.sol contracts/mocks/MockBottoLiquidityMiningV3.sol test/BottoLiquidityMiningV3.test.js
git commit -m "feat: implement BIP-86 reward recovery"
```

### Task 3: Verify Upgrade Safety and Regression Coverage

**Files:**
- Modify only if a verification failure reveals a defect in one of the Task 2 files
- Verify: all Solidity contracts and tests

**Interfaces:**
- Consumes: rewritten V3 and full repository suite
- Produces: compile, storage-layout, focused behavior, regression, and clean-worktree evidence

- [ ] **Step 1: Compile every contract from scratch**

```bash
npx truffle compile --all
```

Expected: compilation succeeds under Solidity 0.7.6 without warnings introduced by V3.

- [ ] **Step 2: Run the full test suite**

```bash
npx truffle test
```

Expected: all existing V1/V2 tests and new V3 tests PASS.

- [ ] **Step 3: Re-run the focused V3 suite independently**

```bash
npx truffle test test/BottoLiquidityMiningV3.test.js
```

Expected: all BIP-86 tests PASS independently without ordering dependencies.

- [ ] **Step 4: Confirm storage validation was exercised**

Verify the test fixture reaches `upgradeProxy(proxy.address, BottoLiquidityMiningV3)` with representative V2 user state. A successful upgrade plus preserved state assertions is the repository-supported OpenZeppelin storage-layout validation.

- [ ] **Step 5: Inspect the final diff and repository state**

```bash
git diff HEAD~1 --check
git status --short
git log -3 --oneline
```

Expected: no whitespace errors; only the approved contract, test, specification, and plan changes exist; working tree is clean after commits.

- [ ] **Step 6: Report verification and explicitly exclude deployment**

Report the exact test counts/results, the fixed treasury and deadline, the LP-safety behavior, and any environment limitations. State explicitly that no deployment, proxy upgrade, signature, or mainnet transaction was performed.
