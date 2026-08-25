# BIP-86 Liquidity Mining Recovery Design

## Purpose

Rewrite the undeployed `BottoLiquidityMiningV3` implementation so the deployed
liquidity-mining proxy can execute BIP-86 without putting users' staked
BOTTO-ETH UNI-V2 principal at risk.

BIP-86 established March 30, 2026 as the final date for claiming liquidity
mining BOTTO rewards. After that deadline, remaining BOTTO rewards are to be
returned to the Botto DAO treasury. The proposal expires reward claims only;
it does not transfer or expire users' staked LP tokens.

## Deployment Baseline

- Proxy: `0xf8515Cae6915838543bCD7756F39268CE8F853Fd`
- Current deployed implementation: `BottoLiquidityMiningV2` at
  `0x49129912b35283dc64476641837dfe856b48fa81`
- BOTTO token: `0x9dfad1b7102d46b1b197b90095b5c4e9f5845bba`
- DAO treasury: `0x35bB964878D7B6dDfa69cf0B97EE63Fa3c9D9B49`
- Contract and ProxyAdmin owner: `0xcC23e5a344EB4E99114a8F25f6037951A39AA858`

The repository's existing V3 has never been deployed. Its ABI, events, and
behavior do not need to be preserved. The supported upgrade path is directly
from the deployed V2 to the rewritten V3.

## Fixed Governance Parameters

V3 defines constants rather than new storage variables:

- `CLAIM_DEADLINE = 1774915199`, representing March 30, 2026 at 23:59:59 UTC.
- `DAO_TREASURY = 0x35bB964878D7B6dDfa69cf0B97EE63Fa3c9D9B49`.

Using the end of the specified UTC calendar day resolves the BIP's date-only
wording conservatively. Because deployment occurs after the deadline, the
chosen hour does not change current eligibility.

## Contract Behavior

### Reward recovery

V3 adds `recoverUnclaimedRewards()` with no parameters.

- Only `owner()` may call it.
- It reverts at or before `CLAIM_DEADLINE`.
- It reads the proxy's complete BOTTO balance.
- It reverts if the BOTTO balance is zero.
- It transfers the complete balance directly to `DAO_TREASURY`.
- The caller cannot select another recipient or a partial amount.
- It emits `UnclaimedRewardsRecovered(address indexed treasury, uint256 amount)`.
- It is non-reentrant.

The function may be called again if BOTTO is later sent to the proxy. Each call
still transfers the complete then-current balance only to the treasury.

### User withdrawal

V3 overrides `withdraw()` while preserving its existing selector and return
types.

At or before `CLAIM_DEADLINE`, it preserves V2 behavior:

- update reward accounting;
- close the user's complete staking position;
- return the user's complete UNI-V2 LP principal;
- transfer the calculated BOTTO reward;
- update `userClaimedRewards` and `totalClaimedRewards`;
- emit the existing `Payout` and `Withdraw` events.

After `CLAIM_DEADLINE`, it implements BIP-86 expiry:

- update final reward accounting so the forfeited amount is auditable;
- close the user's complete staking position;
- return the user's complete UNI-V2 LP principal;
- transfer zero BOTTO;
- do not increase `userClaimedRewards` or `totalClaimedRewards`;
- emit `RewardsForfeited(address indexed staker, uint256 amount)` with the
  calculated but expired reward;
- emit the existing `Withdraw` event for the returned LP amount;
- return zero in the `reward` return value.

Closing the position before transferring LP preserves checks-effects-
interactions. A second withdrawal by the same account continues to revert
because it has no remaining stake.

### Generic token rescue

V3 overrides `rescueTokens(address tokenToRescue, address to, uint256 amount)`.

- BOTTO cannot be transferred through this generic function; callers must use
  `recoverUnclaimedRewards()`. This enforces the deadline, full-balance
  recovery, and treasury-only destination.
- BOTTO-ETH UNI-V2 rescue remains limited to the contract balance exceeding
  `totalStake()`.
- Other unrelated ERC-20 tokens retain the existing owner rescue behavior.
- The function remains owner-only and non-reentrant.

### Removed undeployed behavior

The existing undeployed V3 `terminate()` function and its associated events
are removed. That implementation reserves all ended-program rewards and cannot
execute BIP-86, so retaining it would add misleading and unused behavior.

## Upgrade and Storage Safety

No existing state variable may be added, removed, reordered, or have its type
changed in `BottoLiquidityMining` or `BottoLiquidityMiningV2`.

The base `_applyReward(address)` function changes visibility from `private` to
`internal` so V3 can reuse the exact V2 position-closing calculation. Function
visibility does not change storage layout. V3 introduces constants and events
only, neither of which consumes proxy storage.

The upgrade must be validated against V2's storage layout before deployment.
Existing proxy state, including all user stake mappings, accumulated rewards,
weights, totals, token addresses, ownership, and reentrancy state, must remain
unchanged immediately after the upgrade.

## Security Invariants

1. Only the owner can recover expired BOTTO.
2. Recovered BOTTO can only reach the fixed DAO treasury.
3. Recovery cannot happen on or before the claim deadline.
4. Recovery cannot transfer BOTTO-ETH LP tokens.
5. Generic rescue cannot bypass BOTTO recovery restrictions.
6. Every staker can recover their complete LP principal after reward recovery.
7. No staker can receive BOTTO rewards after the deadline.
8. A staking position can be withdrawn only once.
9. The upgrade does not alter any V2 storage slot.
10. Existing owner and reentrancy protections remain active.

## Test Strategy

Tests are written before production changes and must demonstrate expected
failures against the existing V3 before implementation.

### Deadline behavior

- Owner recovery before the deadline reverts.
- Withdrawal at the deadline retains V2 reward behavior.
- Recovery one second after the deadline succeeds.
- Withdrawal one second after the deadline returns LP and pays zero BOTTO.

### Recovery controls

- Non-owner recovery reverts.
- The full BOTTO balance reaches `DAO_TREASURY`.
- The LM proxy's BOTTO balance becomes zero.
- Recovery with a zero balance reverts.
- Generic rescue of BOTTO reverts.
- BOTTO accidentally received later can be recovered only to the treasury.

### LP safety

- Recovery does not change the proxy's LP balance or `totalStake()`.
- Late withdrawal succeeds after the proxy's BOTTO balance has been recovered.
- Late withdrawal transfers the user's complete LP principal.
- Late withdrawal clears the user stake and decrements `totalStakers` and
  `totalStake()` correctly.
- A second withdrawal reverts.
- Owner cannot rescue LP principal belonging to stakers.
- Owner can rescue only genuine excess LP tokens.

### Accounting and compatibility

- A pre-deadline withdrawal still updates all V2 claimed-reward accounting.
- A post-deadline withdrawal does not update claimed-reward totals.
- The forfeiture event reports the calculated expired reward.
- The upgrade preserves representative V2 state for multiple stakers.
- OpenZeppelin's upgrade validation accepts the V2-to-V3 storage layout.
- The complete existing test suite remains green.

## Deployment Preconditions

Deployment is outside the implementation task. Before any mainnet upgrade:

1. Review the final contract and tests independently.
2. Run the complete suite with the repository's supported Node and Truffle
   versions.
3. Validate the V2-to-V3 upgrade and storage layout.
4. Test the upgrade and recovery sequence on a mainnet fork using the live
   proxy state.
5. Confirm the fixed treasury address through the DAO's operational process.
6. Simulate both the ProxyAdmin upgrade and `recoverUnclaimedRewards()` calls.
7. Publish verified V3 source and communicate that LP-only withdrawal remains
   available to late stakers.

The implementation must not deploy, upgrade, or submit any mainnet
transaction.
