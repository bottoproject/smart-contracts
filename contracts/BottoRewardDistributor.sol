// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/lib/contracts/libraries/TransferHelper.sol";

/// @title Eleven-Yellow ETH reward distributor service
/// @notice Provides cumulative ETH rewards for specific claimants
contract BottoRewardDistributor is
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeMath for uint256;

    mapping(address => uint256) public rewards;

    event Claim(address indexed claimant, uint256 amount);
    event Deposit(address depositor, uint256 amount);
    event RecoveryTransfer(address token, uint256 amount, address recipient);

    function initialize() public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();
    }

    /// @notice Deposit ETH for claim by given addresses & amounts
    /// @param addresses_ list of addresses to deposit rewards to
    /// @param amounts_ list of reward amounts that addresses will receive
    /// @dev Addresses & amounts are provided as correlated equal length indexed arrays
    /// @dev Deposit must match amounts iterated total & are assigned cumulatively for addresses
    function deposit(address[] calldata addresses_, uint256[] calldata amounts_)
        public
        payable
        virtual
        nonReentrant
    {
        require(msg.value > 0, "Invalid ETH amount");
        require(addresses_.length == amounts_.length, "Input length mismatch");

        uint256 totalRewards = 0;

        for (uint256 i = 0; i < addresses_.length; i++) {
            totalRewards = totalRewards.add(amounts_[i]);
            rewards[addresses_[i]] = rewards[addresses_[i]].add(amounts_[i]);
        }

        require(
            totalRewards == msg.value,
            "Reward total must match deposited value"
        );

        emit Deposit(msg.sender, msg.value);
    }

    /// @notice Claim ETH allocated to a specified address
    /// @param claimant_ address of the claimant (can be different than msg.sender)
    /// @dev Claim can be made for any claimant by any caller, with ETH transfered to claimant
    function claim(address payable claimant_) public virtual nonReentrant {
        require(rewards[claimant_] > 0, "Nothing to reward");
        uint256 _amount = rewards[claimant_];
        rewards[claimant_] = 0;
        claimant_.transfer(_amount);
        emit Claim(claimant_, _amount);
    }

    /// @notice Sweeps excess tokens to a specified recipient address
    /// @param token_ address of token to recover
    /// @param recipient_ payable address for token beneficiary
    function recover(address token_, address payable recipient_)
        public
        virtual
        onlyOwner
    {
        uint256 _balance = IERC20(token_).balanceOf(address(this));
        TransferHelper.safeTransfer(token_, recipient_, _balance);
        emit RecoveryTransfer(token_, _balance, recipient_);
    }
}
