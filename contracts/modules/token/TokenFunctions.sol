/* Copyright (C) 2020 NexusMutual.io

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

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../abstract/MasterAware.sol";
import "../../interfaces/IPooledStaking.sol";
import "../cover/QuotationData.sol";
import "./NXMToken.sol";
import "./TokenController.sol";
import "./TokenData.sol";

contract TokenFunctions is MasterAware {
  using SafeMath for uint;

  TokenController public tc;
  TokenData public td;
  NXMToken public tk;
  QuotationData public qd;
  IPooledStaking public pooledStaking;

  event BurnCATokens(uint claimId, address addr, uint amount);

  /**
   * @dev Rewards stakers on purchase of cover on smart contract.
   * @param _contractAddress smart contract address.
   * @param _coverPriceNXM cover price in NXM.
   */
  function pushStakerRewards(address _contractAddress, uint _coverPriceNXM) external onlyInternal {
    uint rewardValue = _coverPriceNXM.mul(td.stakerCommissionPer()).div(100);
    pooledStaking.accumulateReward(_contractAddress, rewardValue);
  }

  /**
   * @dev to get the all the cover locked tokens of a user
   * @param _of is the user address in concern
   * @return amount locked
   */
  function getUserAllLockedCNTokens(address _of) external view returns (uint) {

    uint[] memory coverIds = qd.getAllCoversOfUser(_of);
    uint total;

    for (uint i = 0; i < coverIds.length; i++) {
      bytes32 reason = keccak256(abi.encodePacked("CN", _of, coverIds[i]));
      uint coverNote = tc.tokensLocked(_of, reason);
      total = total.add(coverNote);
    }

    return total;
  }

  /**
   * @dev Change Dependent Contract Address
   */
  function changeDependentContractAddress() public {
    td = TokenData(master.getLatestAddress("TD"));
    tc = TokenController(master.getLatestAddress("TC"));
    tk = NXMToken(master.dAppToken());
    qd = QuotationData(master.getLatestAddress("QD"));
    pooledStaking = IPooledStaking(master.getLatestAddress("PS"));
  }

  /**
   * @dev to burn the deposited cover tokens
   * @param coverId is id of cover whose tokens have to be burned
   * @return the status of the successful burning
   */
  function burnDepositCN(uint coverId) external onlyInternal returns (bool success) {

    address _of = qd.getCoverMemberAddress(coverId);
    bytes32 reason = keccak256(abi.encodePacked("CN", _of, coverId));
    uint lockedAmount = tc.tokensLocked(_of, reason);

    (uint amount,) = td.depositedCN(coverId);
    amount = amount.div(2);

    // limit burn amount to actual amount locked
    uint burnAmount = lockedAmount < amount ? lockedAmount : amount;

    if (burnAmount != 0) {
      tc.burnLockedTokens(_of, reason, amount);
    }

    return true;
  }

  /**
   * @dev Unlocks covernote locked against a given cover
   * @param coverId id of cover
   */
  function unlockCN(uint coverId) external onlyInternal {
    address coverHolder = qd.getCoverMemberAddress(coverId);
    bytes32 reason = keccak256(abi.encodePacked("CN", coverHolder, coverId));
    uint lockedCN = tc.tokensLocked(coverHolder, reason);
    if (lockedCN != 0) {
      tc.releaseLockedTokens(coverHolder, reason, lockedCN);
    }
  }

  /**
   * @dev Burns tokens used for fraudulent voting against a claim
   * @param claimid Claim Id.
   * @param _value number of tokens to be burned
   * @param _of Claim Assessor's address.
   */
  function burnCAToken(uint claimid, uint _value, address _of) external onlyGovernance {
    tc.burnLockedTokens(_of, "CLA", _value);
    emit BurnCATokens(claimid, _of, _value);
  }


  /**
   * @dev to check if a  member is locked for member vote
   * @param _of is the member address in concern
   * @return the boolean status
   */
  function isLockedForMemberVote(address _of) public view returns (bool) {
    return now < tk.isLockedForMV(_of);
  }

}
