// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../interfaces/INXMToken.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IIndividualClaims.sol";
import "../../interfaces/IAssessment.sol";
import "../../interfaces/IERC20Detailed.sol";
import "../../interfaces/ICoverNFT.sol";

import "../../abstract/MasterAwareV2.sol";

/// Provides a way for contracts which don't use the Gateway.sol contract to migrate covers to V2
/// using the submitClaim claim function.
contract CoverMigrator is MasterAwareV2 {

  function cover() internal view returns (ICover) {
    return ICover(getInternalContractAddress(ID.CO));
  }

  /// @dev Migrates covers for arNFT-like contracts that don't use Gateway.sol
  ///
  /// @param coverId          Legacy (V1) cover identifier
  function submitClaim(uint coverId) external {
    cover().migrateCoverFromOwner(coverId, msg.sender, tx.origin);
  }

  /// @dev Updates internal contract addresses to the ones stored in master. This function is
  /// automatically called by the master contract when a contract is added or upgraded.
  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
  }
}
