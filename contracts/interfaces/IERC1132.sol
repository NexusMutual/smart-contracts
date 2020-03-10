pragma solidity ^0.5.16;

/**
 * @title Subset of ERC1132 interface
 * @dev see https://github.com/ethereum/EIPs/issues/1132
 */

interface IERC1132 {

  struct LockToken {
    uint256 amount;
    uint256 validity;
    bool claimed;
  }

  event Locked(
    address indexed _of,
    bytes32 indexed _reason,
    uint256 _amount,
    uint256 _validity
  );

  event Unlocked(
    address indexed _of,
    bytes32 indexed _reason,
    uint256 _amount
  );

  function lock(bytes32 _reason, uint256 _amount, uint256 _time) external returns (bool);

  function tokensLocked(address _of, bytes32 _reason) external view returns (uint256 amount);

  function tokensLockedAtTime(address _of, bytes32 _reason, uint256 _time) external view returns (uint256 amount);

  function totalBalanceOf(address _of) external view returns (uint256 amount);

  function extendLock(bytes32 _reason, uint256 _time) external returns (bool);

  function increaseLockAmount(bytes32 _reason, uint256 _amount) external returns (bool);

  function tokensUnlockable(address _of, bytes32 _reason) external view returns (uint256 amount);

  function unlock(address _of) external returns (uint256 unlockableTokens);

  function getUnlockableTokens(address _of) external view returns (uint256 unlockableTokens);
}
