pragma solidity ^0.5.0;

/**
 * @title ERC1132 interface
 * @dev see https://github.com/ethereum/EIPs/issues/1132
 */

contract LockHandler {
  /**
   * @dev Reasons why a user's tokens have been locked
   */
  mapping(address => bytes32[]) public lockReason;

  /**
   * @dev locked token structure
   */
  struct LockToken {
    uint256 amount;
    uint256 validity;
    bool claimed;
  }

  /**
   * @dev Holds number & validity of tokens locked for a given reason for
   *      a specified address
   */
  mapping(address => mapping(bytes32 => LockToken)) public locked;
}
