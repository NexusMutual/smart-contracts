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
import "../../interfaces/IPooledStaking.sol";
import "../capital/MCR.sol";
import "../capital/Pool1.sol";
import "../claims/ClaimsReward.sol";
import "../governance/Governance.sol";
import "../cover/QuotationData.sol";
import "./NXMToken.sol";
import "./TokenController.sol";
import "./TokenData.sol";

contract TokenFunctions is Iupgradable {
  using SafeMath for uint;

  MCR internal m1;
  MemberRoles internal mr;
  NXMToken public tk;
  TokenController internal tc;
  TokenData internal td;
  QuotationData internal qd;
  ClaimsReward internal cr;
  Governance internal gv;
  IPooledStaking pooledStaking;
  Pool1 p1;

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
  * @dev Burns tokens staked on smart contract covered by coverId. Called when a payout is succesfully executed.
  * @param coverId cover id
  * @param asset cover currency
  * @param sumAssured amount of $curr to burn
  */
  function burnStakedTokens(uint coverId, address asset, uint sumAssured) external onlyInternal {

    (, address scAddress) = qd.getscAddressOfCover(coverId);
    uint tokenPrice = p1.getTokenPrice(asset);

    // FIXME: "18" needs to be replaced with the number of decimals of the target token if other than ETH or DAI
    uint burnNXMAmount = sumAssured.mul(1e18).div(tokenPrice);
    pooledStaking.pushBurn(scAddress, burnNXMAmount);
  }

  /**
   * @dev Returns amount of NXM Tokens locked as Cover Note for given coverId.
   * @param _of address of the coverHolder.
   * @param _coverId coverId of the cover.
   */
  function getUserLockedCNTokens(address _of, uint _coverId) external view returns (uint) {
    return _getUserLockedCNTokens(_of, _coverId);
  }

  /**
   * @dev to get the all the cover locked tokens of a user
   * @param _of is the user address in concern
   * @return amount locked
   */
  function getUserAllLockedCNTokens(address _of) external view returns (uint amount) {
    for (uint i = 0; i < qd.getUserCoverLength(_of); i++) {
      amount = amount.add(_getUserLockedCNTokens(_of, qd.getAllCoversOfUser(_of)[i]));
    }
  }

  /**
   * @dev Returns amount of NXM Tokens locked as Cover Note against given coverId.
   * @param _coverId coverId of the cover.
   */
  function getLockedCNAgainstCover(uint _coverId) external view returns (uint) {
    return _getLockedCNAgainstCover(_coverId);
  }

  /**
   * @dev Change Dependent Contract Address
   */
  function changeDependentContractAddress() public {
    tk = NXMToken(ms.tokenAddress());
    td = TokenData(ms.getLatestAddress("TD"));
    tc = TokenController(ms.getLatestAddress("TC"));
    cr = ClaimsReward(ms.getLatestAddress("CR"));
    qd = QuotationData(ms.getLatestAddress("QD"));
    m1 = MCR(ms.getLatestAddress("MC"));
    gv = Governance(ms.getLatestAddress("GV"));
    mr = MemberRoles(ms.getLatestAddress("MR"));
    pooledStaking = IPooledStaking(ms.getLatestAddress("PS"));
    p1 = Pool1(ms.getLatestAddress("P1"));
  }

  /**
   * @dev Set the flag to check if cover note is deposited against the cover id
   * @param coverId Cover Id.
   */
  function depositCN(uint coverId) public onlyInternal returns (bool success) {
    require(_getLockedCNAgainstCover(coverId) > 0, "No cover note available");
    td.setDepositCN(coverId, true);
    success = true;
  }

  /**
   * @param _of address of Member
   * @param _coverId Cover Id
   * @param _lockTime Pending Time + Cover Period 7*1 days
   */
  function extendCNEPOff(address _of, uint _coverId, uint _lockTime) public onlyInternal {
    uint timeStamp = now.add(_lockTime);
    uint coverValidUntil = qd.getValidityOfCover(_coverId);
    if (timeStamp >= coverValidUntil) {
      bytes32 reason = keccak256(abi.encodePacked("CN", _of, _coverId));
      tc.extendLockOf(_of, reason, timeStamp);
    }
  }

  /**
   * @dev to burn the deposited cover tokens
   * @param coverId is id of cover whose tokens have to be burned
   * @return the status of the successful burning
   */
  function burnDepositCN(uint coverId) public onlyInternal returns (bool success) {
    address _of = qd.getCoverMemberAddress(coverId);
    uint amount;
    (amount,) = td.depositedCN(coverId);
    amount = (amount.mul(50)).div(100);
    bytes32 reason = keccak256(abi.encodePacked("CN", _of, coverId));
    tc.burnLockedTokens(_of, reason, amount);
    success = true;
  }

  /**
   * @dev Unlocks covernote locked against a given cover
   * @param coverId id of cover
   */
  function unlockCN(uint coverId) public onlyInternal {
    (, bool isDeposited) = td.depositedCN(coverId);
    require(!isDeposited, "Cover note is deposited and can not be released");
    uint lockedCN = _getLockedCNAgainstCover(coverId);
    if (lockedCN != 0) {
      address coverHolder = qd.getCoverMemberAddress(coverId);
      bytes32 reason = keccak256(abi.encodePacked("CN", coverHolder, coverId));
      tc.releaseLockedTokens(coverHolder, reason, lockedCN);
    }
  }

  /**
   * @dev Burns tokens used for fraudulent voting against a claim
   * @param claimid Claim Id.
   * @param _value number of tokens to be burned
   * @param _of Claim Assessor's address.
   */
  function burnCAToken(uint claimid, uint _value, address _of) public {

    require(ms.checkIsAuthToGoverned(msg.sender));
    tc.burnLockedTokens(_of, "CLA", _value);
    emit BurnCATokens(claimid, _of, _value);
  }

  /**
   * @dev to lock cover note tokens
   * @param coverNoteAmount is number of tokens to be locked
   * @param coverPeriod is cover period in concern
   * @param coverId is the cover id of cover in concern
   * @param _of address whose tokens are to be locked
   */
  function lockCN(
    uint coverNoteAmount,
    uint coverPeriod,
    uint coverId,
    address _of
  )
  public
  onlyInternal
  {
    uint validity = (coverPeriod * 1 days).add(td.lockTokenTimeAfterCoverExp());
    bytes32 reason = keccak256(abi.encodePacked("CN", _of, coverId));
    td.setDepositCNAmount(coverId, coverNoteAmount);
    tc.lockOf(_of, reason, coverNoteAmount, validity);
  }

  /**
   * @dev to check if a  member is locked for member vote
   * @param _of is the member address in concern
   * @return the boolean status
   */
  function isLockedForMemberVote(address _of) public view returns (bool) {
    return now < tk.isLockedForMV(_of);
  }

  /**
   * @dev Returns amount of NXM Tokens locked as Cover Note for given coverId.
   * @param _coverId coverId of the cover.
   */
  function _getLockedCNAgainstCover(uint _coverId) internal view returns (uint) {
    address coverHolder = qd.getCoverMemberAddress(_coverId);
    bytes32 reason = keccak256(abi.encodePacked("CN", coverHolder, _coverId));
    return tc.tokensLockedAtTime(coverHolder, reason, now);
  }

  /**
   * @dev Returns amount of NXM Tokens locked as Cover Note for given coverId.
   * @param _of address of the coverHolder.
   * @param _coverId coverId of the cover.
   */
  function _getUserLockedCNTokens(address _of, uint _coverId) internal view returns (uint) {
    bytes32 reason = keccak256(abi.encodePacked("CN", _of, _coverId));
    return tc.tokensLockedAtTime(_of, reason, now);
  }
}
