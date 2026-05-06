// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "./BottoLiquidityMiningV2.sol";

/// @title Botto Liquidity Mining — V3
/// @notice Storage-layout-compatible upgrade on top of V2 that lets the owner claw
///         back pending (earned-but-unclaimed) BOTTO rewards via rescueTokens.
/// @dev    Inherits from V2 so the `totalDueRewards` storage slot and the
///         `totalDepositRewards()` / `updateEndTime()` behavior added in V2 are
///         preserved. No new state variables are declared in V3.
contract BottoLiquidityMiningV3 is BottoLiquidityMiningV2 {
    using SafeMath for uint256;
    using TransferHelper for address;

    /// @notice Emitted whenever the owner rescues BOTTO. Useful for off-chain
    ///         accounting/auditing of pending-reward clawbacks.
    event RewardsRescued(address indexed to, uint256 amount);

    /// @notice Rescue tokens held by the contract.
    /// @dev    - `bottoEth` (LP) protection is preserved: only the portion of the
    ///           contract's bottoEth balance that exceeds `totalStake()` is rescuable.
    ///           Staked LP tokens still belong to users and cannot be touched.
    ///         - The previous `BOTTO` restriction (which reserved
    ///           `totalRewards - totalClaimedRewards` for stakers) is removed. The
    ///           owner may now rescue any BOTTO held by the contract, including
    ///           pending rewards — both those still accruing against `totalRewards`
    ///           and those locked in `totalDueRewards` from a prior `updateEndTime`.
    ///         - Any other token: rescuable in full (unchanged).
    /// @param tokenToRescue The token address to rescue.
    /// @param to            Recipient address.
    /// @param amount        Amount to transfer.
    function rescueTokens(
        address tokenToRescue,
        address to,
        uint256 amount
    ) public virtual override onlyOwner nonReentrant {
        if (tokenToRescue == bottoEth) {
            require(
                amount <=
                    IERC20(bottoEth).balanceOf(address(this)).sub(totalStake()),
                "LiquidityMiningV3::rescueTokens: that BottoEth belongs to stakers"
            );
        } else if (tokenToRescue == botto) {
            // No reservation for unclaimed/pending rewards. Emitted so that
            // pending-reward clawbacks are clearly distinguishable on-chain.
            emit RewardsRescued(to, amount);
        }

        tokenToRescue.safeTransfer(to, amount);
    }
}
