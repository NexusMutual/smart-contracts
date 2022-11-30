// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IAssessment.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/IERC20Detailed.sol";
import "../../interfaces/IIndividualClaims.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";

/// Provides a way for contracts which don't use the Gateway.sol contract to migrate covers to V2
/// using the submitClaim claim function.
contract CoverMigrator is MasterAwareV2 {

  function cover() internal view returns (ICover) {
    return ICover(getInternalContractAddress(ID.CO));
  }

  function individualClaims() internal view returns (IIndividualClaims) {
    return IIndividualClaims(getInternalContractAddress(ID.IC));
  }

  function coverNFT() internal returns (ICoverNFT) {
    return ICoverNFT(cover().coverNFT());
  }

  /// @dev Migrates covers for arNFT-like contracts that don't use Gateway.sol
  ///
  /// @param coverId          Legacy (V1) cover identifier
  function submitClaim(
    uint32 coverId,
    uint16 segmentId,
    uint96 requestedAmount,
    string calldata ipfsMetadata
  ) payable external whenNotPaused returns (uint newCoverId){
    newCoverId =  cover().migrateCoverFromOwner(coverId, msg.sender, address(this));
    individualClaims().submitClaim{value: msg.value}(uint32(newCoverId), segmentId, requestedAmount, ipfsMetadata);
    coverNFT().transferFrom(address(this), msg.sender, newCoverId);
    return newCoverId;
  }

  /// @dev Updates internal contract addresses to the ones stored in master. This function is
  /// automatically called by the master contract when a contract is added or upgraded.
  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
    internalContracts[uint(ID.IC)] = master.getLatestAddress("IC");
  }
}
