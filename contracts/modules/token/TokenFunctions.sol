// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../abstract/MasterAware.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/ITokenController.sol";
import "../../interfaces/ITokenData.sol";
import "../../interfaces/ITokenFunctions.sol";


contract TokenFunctions is ITokenFunctions, MasterAware {
  using SafeMath for uint;

  ITokenController public tc;
  INXMToken public tk;
  IQuotationData public qd;

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
    tc = ITokenController(master.getLatestAddress("TC"));
    tk = INXMToken(master.tokenAddress());
    qd = IQuotationData(master.getLatestAddress("QD"));
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
