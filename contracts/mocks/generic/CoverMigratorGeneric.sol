// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/ICoverMigrator.sol";

contract CoverMigratorGeneric is ICoverMigrator {
  function submitClaim(uint) external pure {
    revert("Unsupported");
  }

  function migrateCoverFrom(uint, address, address) external pure returns (uint) {
    revert("Unsupported");
  }
}
