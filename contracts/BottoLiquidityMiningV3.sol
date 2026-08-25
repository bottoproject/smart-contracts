// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "./BottoLiquidityMiningV2.sol";

/// @title Botto liquidity mining BIP-86 recovery upgrade
/// @notice Expires BOTTO reward claims while preserving stakers' LP principal.
contract BottoLiquidityMiningV3 is BottoLiquidityMiningV2 {
    using SafeMath for uint256;
    using TransferHelper for address;

    uint256 public constant CLAIM_DEADLINE = 1774915199;
    address public constant DAO_TREASURY =
        0x35bb964878d7B6ddFA69cF0b97EE63fa3C9d9b49;

    event UnclaimedRewardsRecovered(
        address indexed treasury,
        uint256 amount
    );
    event RewardsForfeited(address indexed staker, uint256 amount);

    function _claimDeadline() internal view virtual returns (uint256) {
        return CLAIM_DEADLINE;
    }

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
                userClaimedRewards[msg.sender] = userClaimedRewards[msg.sender]
                    .add(reward);
                totalClaimedRewards = totalClaimedRewards.add(reward);

                emit Payout(msg.sender, reward);
            }
        } else {
            reward = 0;
            emit RewardsForfeited(msg.sender, calculatedReward);
        }

        emit Withdraw(msg.sender, bottoEthOut);
    }

    function payout()
        public
        virtual
        override
        returns (uint256 reward)
    {
        require(
            block.timestamp <= _claimDeadline(),
            "LiquidityMiningV3::payout: claim period expired"
        );

        return super.payout();
    }

    /// @notice Sends all expired BOTTO rewards to the BIP-86 treasury.
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
                amount <=
                    IERC20(bottoEth).balanceOf(address(this)).sub(
                        totalStake()
                    ),
                "LiquidityMiningV3::rescueTokens: that BottoEth belongs to stakers"
            );
        }

        tokenToRescue.safeTransfer(to, amount);
    }
}
