// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Minimal Symbiotic vault mock to drive DefaultStakerRewards tests.
/// It is NOT a full vault implementation – just a programmable state box.
contract DSRMockVault {
    // timestamp => epoch
    mapping(uint48 => uint256) private _epochAt;

    // Global active shares / stake at timestamp
    mapping(uint48 => uint256) private _activeSharesAt;
    mapping(uint48 => uint256) private _activeStakeAt;

    // Global withdrawals / withdrawal shares per epoch
    mapping(uint256 => uint256) private _withdrawals;
    mapping(uint256 => uint256) private _withdrawalShares;

    // Per-account active shares at timestamp
    mapping(address => mapping(uint48 => uint256)) private _activeSharesOfAt;

    // Per-account withdrawal shares per epoch
    mapping(address => mapping(uint256 => uint256)) private _withdrawalSharesOf;

    // ----------
    // Setters (test-only)
    // ----------

    function setEpochAt(uint48 timestamp, uint256 epoch) external {
        _epochAt[timestamp] = epoch;
    }

    function setActiveSharesAt(uint48 timestamp, uint256 shares) external {
        _activeSharesAt[timestamp] = shares;
    }

    function setActiveStakeAt(uint48 timestamp, uint256 stake) external {
        _activeStakeAt[timestamp] = stake;
    }

    function setActiveSharesOfAt(address account, uint48 timestamp, uint256 shares) external {
        _activeSharesOfAt[account][timestamp] = shares;
    }

    function setWithdrawals(uint256 epoch, uint256 amount) external {
        _withdrawals[epoch] = amount;
    }

    function setWithdrawalShares(uint256 epoch, uint256 amount) external {
        _withdrawalShares[epoch] = amount;
    }

    function setWithdrawalSharesOf(address account, uint256 epoch, uint256 amount) external {
        _withdrawalSharesOf[account][epoch] = amount;
    }


    // ----------
    // Read API used by DefaultStakerRewards
    // ----------

    function epochAt(uint48 timestamp) external view returns (uint256) {
        return _epochAt[timestamp];
    }

    function activeSharesAt(uint48 timestamp, bytes calldata /* hint */ )
        external
        view
        returns (uint256)
    {
        return _activeSharesAt[timestamp];
    }

    function activeStakeAt(uint48 timestamp, bytes calldata /* hint */ )
        external
        view
        returns (uint256)
    {
        return _activeStakeAt[timestamp];
    }

    function withdrawals(uint256 epoch) external view returns (uint256) {
        return _withdrawals[epoch];
    }

    function withdrawalShares(uint256 epoch) external view returns (uint256) {
        return _withdrawalShares[epoch];
    }

    function activeSharesOfAt(address account, uint48 timestamp, bytes calldata /* hint */ )
        external
        view
        returns (uint256)
    {
        return _activeSharesOfAt[account][timestamp];
    }

    function withdrawalSharesOf(uint256 epoch, address account)
        external
        view
        returns (uint256)
    {
        return _withdrawalSharesOf[account][epoch];
    }
}
