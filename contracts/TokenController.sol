/* Copyright (C) 2017 NexusMutual.io

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity ^0.4.24;

import "./imports/openzeppelin-solidity/math/SafeMaths.sol";
import "./imports/ERC1132/IERC1132.sol";
import "./NXMToken.sol";
import "./imports/govblocks-protocol/Governed.sol";
import "./Iupgradable.sol";
import "./NXMaster.sol";


contract TokenController is IERC1132, Governed, Iupgradable {
  using SafeMaths for uint256;

  event Burned(address indexed member, uint256 amount, bytes32 lockedUnder);

  NXMToken public token;
  NXMaster public ms;

  modifier onlyInternal {
    require(ms.isInternal(msg.sender) == true);
    _;
  }

  constructor(address _token) {
    token = NXMToken(_token);
  }

  function changeMasterAddress(address _add) {
    if (address(ms) != address(0)) {
      require(ms.isInternal(msg.sender) == true);
    }
    ms = NXMaster(_add);
  }

  function changeDependentContractAddress() public {
    //Just for interface
  }

  /**
   * @dev Locks a specified amount of tokens against an address,
   *    for a specified reason and time
   * @param _reason The reason to lock tokens
   * @param _amount Number of tokens to be locked
   * @param _time Lock time in seconds
   */
  function lock(bytes32 _reason, uint256 _amount, uint256 _time)
    public
    returns (bool)
  {
    // If tokens are already locked, then functions extendLock or
    // increaseLockAmount should be used to make any changes
    require(_tokensLocked(msg.sender, _reason) == 0);
    require(_amount != 0);

    if (locked[msg.sender][_reason].amount == 0)
      lockReason[msg.sender].push(_reason);

    _lock(msg.sender, _reason, _amount, _time);
    return true;
  }
  
  /**
   * @dev Returns tokens locked for a specified address for a
   *    specified reason
   *
   * @param _of The address whose tokens are locked
   * @param _reason The reason to query the lock tokens for
   */
  function tokensLocked(address _of, bytes32 _reason)
    public
    view
    returns (uint256 amount)
  {
    return _tokensLocked(_of, _reason);
  }
  
  /**
   * @dev Extends lock for a specified reason and time
   * @param _reason The reason to lock tokens
   * @param _time Lock extension time in seconds
   */
  function extendLock(bytes32 _reason, uint256 _time)
    public
    returns (bool)
  {
    _extendLock(msg.sender, _reason, _time);
    return true;
  }

  /**
   * @dev Extends lock for a specified reason and time
   * @param _reason The reason to lock tokens
   * @param _time Lock extension time in seconds
   */
  function extendLock(address _of, bytes32 _reason, uint256 _time)
    public
    onlyInternal
    returns (bool)
  {
    _extendLock(_of, _reason, _time);
    return true;
  }
  
  /**
   * @dev Increase number of tokens locked for a specified reason
   * @param _reason The reason to lock tokens
   * @param _amount Number of tokens to be increased
   */
  function increaseLockAmount(bytes32 _reason, uint256 _amount)
    public
    returns (bool)
  {    
    _increaseLockAmount(msg.sender, _reason, _amount);
    return true;
  }

  /**
   * @dev Increase number of tokens locked for a specified reason
   * @param _reason The reason to lock tokens
   * @param _amount Number of tokens to be increased
   */
  function increaseLockAmount(address _of, bytes32 _reason, uint256 _amount)
    public
    onlyInternal
    returns (bool)
  {
    _increaseLockAmount(_of, _reason, _amount);
    return true;
  }

  /**
   * @dev Unlocks the unlockable tokens of a specified address
   * @param _of Address of user, claiming back unlockable tokens
   */
  function unlock(address _of)
    public
    returns (uint256 unlockableTokens)
  {
    uint256 lockedTokens;

    for (uint256 i = 0; i < lockReason[_of].length; i++) {
      lockedTokens = _tokensUnlockable(_of, lockReason[_of][i]);
      if (lockedTokens > 0) {
        unlockableTokens = unlockableTokens.add(lockedTokens);
        locked[_of][lockReason[_of][i]].claimed = true;
        emit Unlocked(_of, lockReason[_of][i], lockedTokens);
      }
    }  

    if (unlockableTokens > 0)
      token.transfer(_of, unlockableTokens);
  }

  function burnLockedTokens(address _of, bytes32 _reason, uint256 _amount) public onlyInternal {
    _burnLockedTokens(_of, _reason, _amount);
  }

  /**
   * @dev Gets the unlockable tokens of a specified address
   * @param _of The address to query the the unlockable token count of
   */
  function getUnlockableTokens(address _of)
    public
    view
    returns (uint256 unlockableTokens)
  {
    for (uint256 i = 0; i < lockReason[_of].length; i++) {
      unlockableTokens = unlockableTokens.add(_tokensUnlockable(_of, lockReason[_of][i]));
    }  
  }

  /**
   * @dev Returns unlockable tokens for a specified address for a specified reason
   * @param _of The address to query the the unlockable token count of
   * @param _reason The reason to query the unlockable tokens for
   */
  function tokensUnlockable(address _of, bytes32 _reason)
    public
    view
    returns (uint256 amount)
  {
    return _tokensUnlockable(_of, _reason);
  }

  /**
   * @dev Returns tokens locked for a specified address for a
   *    specified reason at a specific time
   *
   * @param _of The address whose tokens are locked
   * @param _reason The reason to query the lock tokens for
   * @param _time The timestamp to query the lock tokens for
   */
  function tokensLockedAtTime(address _of, bytes32 _reason, uint256 _time)
    public
    view
    returns (uint256 amount)
  {
    return _tokensLockedAtTime(_of, _reason, _time);
  }

  /**
   * @dev Returns total tokens held by an address (locked + transferable)
   * @param _of The address to query the total balance of
   */
  function totalBalanceOf(address _of)
    public
    view
    returns (uint256 amount)
  {
    amount = token.balanceOf(_of);

    for (uint256 i = 0; i < lockReason[_of].length; i++) {
      amount = amount.add(tokensLocked(_of, lockReason[_of][i]));
    }   
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
    require(token.operatorTransfer(_of, _amount));

    uint256 validUntil = now.add(_time); //solhint-disable-line
    locked[_of][_reason] = lockToken(_amount, validUntil, false);
    emit Locked(_of, _reason, _amount, validUntil);
  }
  
  /**
   * @dev Returns tokens locked for a specified address for a
   *    specified reason
   *
   * @param _of The address whose tokens are locked
   * @param _reason The reason to query the lock tokens for
   */
  function _tokensLocked(address _of, bytes32 _reason)
    internal
    view
    returns (uint256 amount)
  {
    if (!locked[_of][_reason].claimed)
      amount = locked[_of][_reason].amount;
  }
  
  /**
   * @dev Returns tokens locked for a specified address for a
   *    specified reason at a specific time
   *
   * @param _of The address whose tokens are locked
   * @param _reason The reason to query the lock tokens for
   * @param _time The timestamp to query the lock tokens for
   */
  function _tokensLockedAtTime(address _of, bytes32 _reason, uint256 _time)
    internal
    view
    returns (uint256 amount)
  {
    if (locked[_of][_reason].validity > _time)
      amount = locked[_of][_reason].amount;
  }
  
  /**
   * @dev Extends lock for a specified reason and time
   * @param _of The address whose tokens are locked
   * @param _reason The reason to lock tokens
   * @param _time Lock extension time in seconds
   */
  function _extendLock(address _of, bytes32 _reason, uint256 _time) internal {
    require(_tokensLocked(_of, _reason) > 0);
    locked[_of][_reason].validity = locked[_of][_reason].validity.add(_time);
    emit Unlocked(_of, _reason, locked[_of][_reason].amount);
    emit Locked(_of, _reason, locked[_of][_reason].amount, locked[_of][_reason].validity);
  }

  /**
   * @dev reduce lock duration for a specified reason and time
   * @param _of The address whose tokens are locked
   * @param _reason The reason to lock tokens
   * @param _time Lock reduction time in seconds
   */
  function _reduceLockDuration(address _of, bytes32 _reason, uint256 _time) internal {
    require(_tokensLocked(_of, _reason) > 0);
    locked[_of][_reason].validity = locked[_of][_reason].validity.sub(_time);
    emit Unlocked(_of, _reason, locked[_of][_reason].amount);
    emit Locked(_of, _reason, locked[_of][_reason].amount, locked[_of][_reason].validity);
  }
  
  /**
   * @dev Increase number of tokens locked for a specified reason
   * @param _of The address whose tokens are locked
   * @param _reason The reason to lock tokens
   * @param _amount Number of tokens to be increased
   */
  function _increaseLockAmount(address _of, bytes32 _reason, uint256 _amount) internal {
    require(_tokensLocked(_of, _reason) > 0);
    require(token.operatorTransfer(msg.sender, _amount));

    locked[_of][_reason].amount = locked[_of][_reason].amount.add(_amount);
    emit Locked(_of, _reason, _amount, locked[_of][_reason].validity);
  }

  /**
   * @dev Returns unlockable tokens for a specified address for a specified reason
   * @param _of The address to query the the unlockable token count of
   * @param _reason The reason to query the unlockable tokens for
   */
  function _tokensUnlockable(address _of, bytes32 _reason) internal returns (uint256 amount)
  {
    if (locked[_of][_reason].validity <= now && !locked[_of][_reason].claimed) //solhint-disable-line
      amount = locked[_of][_reason].amount;
  }

  function _burnLockedTokens(address _of, bytes32 _reason, uint256 _amount) internal {
    require(_tokensLocked(_of, _reason) >= _amount);

    locked[_of][_reason].amount = locked[_of][_reason].amount.sub(_amount);
    require(token.burn(_amount));
    emit Burned(_of, _amount, _reason);
  }
}