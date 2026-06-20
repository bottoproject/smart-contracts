// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

import "./BottoLiquidityMiningV2.sol";


contract BottoLiquidityMiningV3 is BottoLiquidityMiningV2 {
    using SafeMath for uint256;
    using TransferHelper for address;

    event BottoRescued(address indexed to, uint256 amount);
    event Terminated(uint256 releasedRewards, uint256 reservedDueRewards);

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
            uint256 reserved = totalDepositRewards().sub(totalClaimedRewards);
            require(
                amount <=
                    IERC20(botto).balanceOf(address(this)).sub(reserved),
                "LiquidityMiningV3::rescueTokens: that BOTTO belongs to stakers"
            );
            emit BottoRescued(to, amount);
        }

        tokenToRescue.safeTransfer(to, amount);
    }

    
    function terminate() public virtual update onlyOwner nonReentrant {
        require(
            startTime != 0,
            "LiquidityMiningV3::terminate: no deposit received"
        );

        if (firstStakeTime != 0) {
            if (block.timestamp < endTime) {
                // Program still running: crystallize earned-so-far, keep the
                // not-yet-earned remainder in `totalRewards` to be released.
                uint256 perSecondReward = totalRewards.div(
                    endTime.sub(firstStakeTime)
                );
                uint256 sinceFirstStakeTime = block.timestamp.sub(
                    firstStakeTime
                );
                uint256 dueRewards = sinceFirstStakeTime.mul(perSecondReward);

                // Never crystallize more than the remaining budget.
                if (dueRewards > totalRewards) {
                    dueRewards = totalRewards;
                }

                totalDueRewards = totalDueRewards.add(dueRewards);
                totalRewards = totalRewards.sub(dueRewards);
            } else {
                // Program already ended: the entire remaining budget has been
                // emitted, so it is all earned and must stay reserved.
                totalDueRewards = totalDueRewards.add(totalRewards);
                totalRewards = 0;
            }
        }
        // If firstStakeTime == 0 nobody ever staked, so nothing was earned and
        // the whole of `totalRewards` is unearned and released below.

        uint256 released = totalRewards;
        totalRewards = 0;
        endTime = block.timestamp;

        emit Terminated(released, totalDueRewards);
    }
}
