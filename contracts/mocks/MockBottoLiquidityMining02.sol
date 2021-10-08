// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "../BottoLiquidityMining.sol";

contract MockBottoLiquidityMining02 is BottoLiquidityMining {
    event Stake2(address indexed staker, uint256 bottoEthIn);

    modifier update2(uint256 bottoEthIn_) {
        require(bottoEthIn_ > 1000, "Invalid amount after upgrade");
        _;
    }

    function stake(uint256 bottoEthIn_)
        public
        override
        update2(bottoEthIn_)
        nonReentrant
    {
        emit Stake2(msg.sender, bottoEthIn_);
    }

    function ownershipTest(bool input_) public view onlyOwner returns (bool) {
        return !input_;
    }
}
