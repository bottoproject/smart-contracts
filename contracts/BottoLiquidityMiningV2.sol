pragma solidity >=0.6.0 <0.8.0;

import "./BottoLiquidityMining.sol";

contract BottoLiquidityMiningV2 is BottoLiquidityMining {

    using SafeMath for uint256;
    using TransferHelper for address;

    uint256 internal totalDueRewards;

    function totalDepositRewards() public view virtual returns (uint256) {
        return totalRewards.add(_totalDueRewards);
    }

    function updateEndTime(uint256 _endTime) public virtual update onlyOwner nonReentrant {
        require(
            block.timestamp < endTime,
            "LiquidityMining::updateEndTime: endTime has passed"
        );
        require(
            block.timestamp < _endTime,
            "LiquidityMining::updateEndTime: new end time must be in future"
        );
        uint256 perSecondReward = totalRewards.div(
            endTime.sub(firstStakeTime)
        );
        uint256 sinceFirstStakeTime = block.timestamp.sub(firstStakeTime);
        uint256 dueRewards = sinceFirstStakeTime.mul(perSecondReward);

        totalRewards = totalRewards.sub(dueRewards);
        _totalDueRewards = _totalDueRewards.add(dueRewards);
        endTime = _endTime;
        if (totalStakers > 0) {
            firstStakeTime = block.timestamp;
        } else {
            firstStakeTime = 0;
        }
    }
}
