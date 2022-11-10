// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

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

  /// @dev Migrates covers for arNFT-like contracts that don't use Gateway.sol
  ///
  /// @param coverId          Legacy (V1) cover identifier
  function submitClaim(uint coverId) external whenNotPaused {
    cover().migrateCoverFromOwner(coverId, msg.sender, tx.origin);
  }

  function usedInternalContracts() internal override pure returns (uint) {
    return CO;
  }
}
