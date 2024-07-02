// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../generic/GovernanceGeneric.sol";

contract MRMockGovernance is GovernanceGeneric {
  function removeDelegation(address) public {}
}
