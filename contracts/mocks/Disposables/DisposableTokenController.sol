// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../../interfaces/INXMToken.sol";
import "../../modules/token/TokenController.sol";

contract DisposableTokenController is TokenController {

  constructor(
    address quotationDataAddress,
    address claimsRewardAddress
  ) TokenController(quotationDataAddress, claimsRewardAddress) {}

  function initialize(
    address payable _masterAddress,
    address payable _tokenAddress,
    address payable _pooledStakingAddress,
    address payable _assessmentAddress
  ) external {

    INXMToken token = INXMToken(_tokenAddress);
    token.changeOperator(address(this));
    token.addToWhiteList(address(this));

    changeMasterAddress(_masterAddress);
    internalContracts[uint(ID.PS)] = _pooledStakingAddress;
    internalContracts[uint(ID.AS)] = _assessmentAddress;
    internalContracts[uint(ID.TK)] = _tokenAddress;
  }

  function addToWhitelist(address _member) public override {
    token().addToWhiteList(_member);
  }

  function lock(
    address _of,
    bytes32 _reason,
    uint256 _amount,
    uint256 _time
  ) external returns (bool) {
    // If tokens are already locked, then functions extendLock or
    // increaseLockAmount should be used to make any changes
    _lock(_of, _reason, _amount, _time);
    return true;
  }

  /**
  * @dev Locks a specified amount of tokens against an address,
  *    for a specified reason and time
  * @param _of address whose tokens are to be locked
  * @param _reason The reason to lock tokens
  * @param _amount Number of tokens to be locked
  * @param _time Lock time in seconds
  */
  function _lock(address _of, bytes32 _reason, uint256 _amount, uint256 _time) internal {
    require(_tokensLocked(_of, _reason) == 0, "TokenController: An amount of tokens is already locked");
    require(_amount != 0, "TokenController: Amount shouldn't be zero");

    if (locked[_of][_reason].amount == 0) {
      lockReason[_of].push(_reason);
    }

    token().operatorTransfer(_of, _amount);

    uint256 validUntil = block.timestamp + _time;
    locked[_of][_reason] = LockToken(_amount, validUntil, false);
    emit Locked(_of, _reason, _amount, validUntil);
  }
}
