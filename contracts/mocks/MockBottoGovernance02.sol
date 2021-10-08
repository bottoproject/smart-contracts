// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "../BottoGovernance.sol";

contract MockBottoGovernance02 is BottoGovernance {
    using SafeMath for uint256;

    event Staked2(address indexed staker, uint256 amount);

    function stake(uint256 amount_) public override {
        require(amount_ > 100, "Invalid amount after upgrade");
        userStakes[msg.sender] = userStakes[msg.sender].add(amount_);
        IERC20(botto).transferFrom(msg.sender, address(this), amount_);
        totalStaked = totalStaked.add(amount_);
        emit Staked2(msg.sender, amount_);
    }

    function ownershipTest(bool input_) public view onlyOwner returns (bool) {
        return !input_;
    }
}
