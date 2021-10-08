// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "../BottoRewardDistributor.sol";

contract MockBottoRewardDistributor02 is BottoRewardDistributor {
    using SafeMath for uint256;

    event Deposit2(address depositor, uint256 amount);

    function deposit(address[] calldata addresses_, uint256[] calldata amounts_)
        public
        payable
        override
        nonReentrant
    {
        require(msg.value > 1000, "Invalid ETH after upgrade");
        require(addresses_.length == amounts_.length, "Input length mismatch");

        emit Deposit2(msg.sender, msg.value);
    }

    function ownershipTest(bool input_) public view onlyOwner returns (bool) {
        return !input_;
    }
}
