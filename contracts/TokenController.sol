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

pragma solidity 0.4.24;

import "./Iupgradable.sol";
import "./imports/ERC1132/IERC1132.sol";
import "./NXMToken.sol";


contract TokenController is IERC1132, Iupgradable {
    using SafeMath for uint256;

    event Burned(address indexed member, bytes32 lockedUnder, uint256 amount);

    NXMToken public token;
    
    /**
    * @dev Just for interface
    */
    function changeDependentContractAddress() public {
        token = NXMToken(ms.tokenAddress());
    }

    /**
     * @dev to change the operator address 
     * @param _newOperator is the new address of operator
     */
    function changeOperator(address _newOperator) public onlyInternal {
        token.changeOperator(_newOperator);
    }
    
    /**
    * @dev Locks a specified amount of tokens,
    *    for a specified reason and time
    * @param _reason The reason to lock tokens
    * @param _amount Number of tokens to be locked
    * @param _time Lock time in seconds
    */
    function lock(bytes32 _reason, uint256 _amount, uint256 _time) public returns (bool)
    {
        // If tokens are already locked, then functions extendLock or
        // increaseLockAmount should be used to make any changes
        _lock(msg.sender, _reason, _amount, _time);
        return true;
    }

    /**
    * @dev Locks a specified amount of tokens against an address,
    *    for a specified reason and time
    * @param _reason The reason to lock tokens
    * @param _amount Number of tokens to be locked
    * @param _time Lock time in seconds
    * @param _of address whose tokens are to be locked
    */
    function lockOf(address _of, bytes32 _reason, uint256 _amount, uint256 _time)
        public
        onlyInternal
        returns (bool)
    {
        // If tokens are already locked, then functions extendLock or
        // increaseLockAmount should be used to make any changes
        _lock(_of, _reason, _amount, _time);
        return true;
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
    function extendLockOf(address _of, bytes32 _reason, uint256 _time)
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
     * @dev burns tokens of an address 
     * @param _of is the address to burn tokens of
     * @param amount is the amount to burn
     * @return the boolean status of the burning process
     */
    function burnFrom (address _of, uint amount) public onlyInternal returns (bool) {
        return token.burnFrom(_of, amount);
    }
    
    /**
    * @dev Burns locked tokens of a user 
    * @param _of address whose tokens are to be burned
    * @param _reason lock reason for which tokens are to be burned
    * @param _amount amount of tokens to burn
    */
    function burnLockedTokens(address _of, bytes32 _reason, uint256 _amount) public onlyInternal {
        _burnLockedTokens(_of, _reason, _amount);
    }

    /**
    * @dev reduce lock duration for a specified reason and time
    * @param _of The address whose tokens are locked
    * @param _reason The reason to lock tokens
    * @param _time Lock reduction time in seconds
    */
    function reduceLock(address _of, bytes32 _reason, uint256 _time) public onlyInternal {
        _reduceLock(_of, _reason, _time);
    } 

    /**
    * @dev Released locked tokens of an address locked for a specific reason
    * @param _of address whose tokens are to be released from lock
    * @param _reason reason of the lock
    * @param _amount amount of tokens to release
    */
    function releaseLockedTokens(address _of, bytes32 _reason, uint256 _amount) 
        public 
        onlyInternal 
    {
        _releaseLockedTokens(_of, _reason, _amount);
    }

    /**
    * @dev Adds an address to whitelist maintained in the contract
    * @param _member address to add to whitelist
    */
    function addToWhitelist(address _member) public onlyInternal {
        token.addToWhiteList(_member);
    }

    /**
    * @dev Removes an address from the whitelist in the token
    * @param _member address to remove
    */
    function removeFromWhitelist(address _member) public onlyInternal {
        token.removeFromWhiteList(_member);
    }

    /**
    * @dev Mints new token for an address
    * @param _member address to reward the minted tokens
    * @param _amount number of tokens to mint
    */
    function mint(address _member, uint _amount) public onlyInternal {
        token.mint(_member, _amount);
    }

    /**
     * @dev Lock the user's tokens 
     * @param _of user's address.
     */
    function lockForMemberVote(address _of, uint _days) public onlyInternal {
        token.lockForMemberVote(_of, _days);
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

    /**
    * @dev Gets the validity of locked tokens of a specified address
    * @param _of The address to query the validity
    * @param reason reason for which tokens were locked 
    */
    function getLockedTokensValidity(address _of, bytes32 reason)
        public
        view
        returns (uint256 validity)
    {
        validity = locked[_of][reason].validity;
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

    function totalSupply() public view returns (uint256)
    {
        return token.totalSupply();
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
            amount = amount.add(_tokensLocked(_of, lockReason[_of][i]));
        }   
    }

    /**
    * @dev Returns the total locked tokens at time
    * @param _of member whose locked tokens are to be calculate
    * @param _time timestamp when the tokens should be locked
    */
    function totalLockedBalance(address _of, uint256 _time) public view returns (uint256 amount) {
        amount = _totalLockedBalance(_of, _time);
    }  

    /**
    * @dev Internal function to returns the total locked tokens at time
    * @param _of member whose locked tokens are to be calculate
    * @param _time timestamp when the tokens should be locked
    */
    function _totalLockedBalance(address _of, uint256 _time) internal view returns (uint256 amount) {
        for (uint256 i = 0; i < lockReason[_of].length; i++) {
            amount = amount.add(_tokensLockedAtTime(_of, lockReason[_of][i], _time));
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
        require(_tokensLocked(_of, _reason) == 0);
        require(_amount != 0);

        if (locked[_of][_reason].amount == 0)
            lockReason[_of].push(_reason);

        require(token.operatorTransfer(_of, _amount));

        uint256 validUntil = now.add(_time); //solhint-disable-line
        locked[_of][_reason] = LockToken(_amount, validUntil, false);
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
        emit Unlocked(_of, _reason, locked[_of][_reason].amount);
        locked[_of][_reason].validity = locked[_of][_reason].validity.add(_time);
        emit Locked(_of, _reason, locked[_of][_reason].amount, locked[_of][_reason].validity);
    }

    /**
    * @dev reduce lock duration for a specified reason and time
    * @param _of The address whose tokens are locked
    * @param _reason The reason to lock tokens
    * @param _time Lock reduction time in seconds
    */
    function _reduceLock(address _of, bytes32 _reason, uint256 _time) internal {
        require(_tokensLocked(_of, _reason) > 0);
        emit Unlocked(_of, _reason, locked[_of][_reason].amount);
        locked[_of][_reason].validity = locked[_of][_reason].validity.sub(_time);
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
        token.operatorTransfer(msg.sender, _amount);

        locked[_of][_reason].amount = locked[_of][_reason].amount.add(_amount);
        emit Locked(_of, _reason, _amount, locked[_of][_reason].validity);
    }

    /**
    * @dev Returns unlockable tokens for a specified address for a specified reason
    * @param _of The address to query the the unlockable token count of
    * @param _reason The reason to query the unlockable tokens for
    */
    function _tokensUnlockable(address _of, bytes32 _reason) internal view returns (uint256 amount)
    {
      if (locked[_of][_reason].validity <= now && !locked[_of][_reason].claimed) //solhint-disable-line
            amount = locked[_of][_reason].amount;
    }

    /**
    * @dev Burns locked tokens of a user 
    * @param _of address whose tokens are to be burned
    * @param _reason lock reason for which tokens are to be burned
    * @param _amount amount of tokens to burn
    */
    function _burnLockedTokens(address _of, bytes32 _reason, uint256 _amount) internal {
        uint256 amount = _tokensLocked(_of, _reason);
        require(amount >= _amount);
        
        if (amount == _amount)
            locked[_of][_reason].claimed = true;
        
        locked[_of][_reason].amount = locked[_of][_reason].amount.sub(_amount);
        token.burn(_amount);
        emit Burned(_of, _reason, _amount);
    }

    /**
    * @dev Released locked tokens of an address locked for a specific reason
    * @param _of address whose tokens are to be released from lock
    * @param _reason reason of the lock
    * @param _amount amount of tokens to release
    */
    function _releaseLockedTokens(address _of, bytes32 _reason, uint256 _amount) 
        internal 
    {
        uint256 amount = _tokensLocked(_of, _reason);
        require(amount >= _amount);

        if (amount == _amount)
            locked[_of][_reason].claimed = true;

        locked[_of][_reason].amount = locked[_of][_reason].amount.sub(_amount);
        token.transfer(_of, _amount);
        emit Unlocked(_of, _reason, _amount);
    }
}