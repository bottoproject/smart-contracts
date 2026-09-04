// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "../BottoLiquidityMiningV3.sol";

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

contract MockAtClaimDeadlineBottoLiquidityMiningV3 is
    BottoLiquidityMiningV3
{
    function _claimDeadline()
        internal
        view
        virtual
        override
        returns (uint256)
    {
        return block.timestamp;
    }
}
