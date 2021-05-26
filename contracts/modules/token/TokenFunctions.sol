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
import "../cover/QuotationData.sol";
import "./NXMToken.sol";
import "./TokenController.sol";
import "./TokenData.sol";

contract TokenFunctions is MasterAware {
  using SafeMath for uint;

  TokenController public tc;
  NXMToken public tk;
  QuotationData public qd;

  event BurnCATokens(uint claimId, address addr, uint amount);

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
    tc = TokenController(master.getLatestAddress("TC"));
    tk = NXMToken(master.tokenAddress());
    qd = QuotationData(master.getLatestAddress("QD"));
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
