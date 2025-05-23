// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../modules/governance/MemberRoles.sol";

contract TestnetMemberRoles is MemberRoles {

  constructor(address _registryAddress) MemberRoles(_registryAddress) {
    // empty
  }

  function joinOnTestnet(address /* _userAddress */) external pure {
    revert("Not implemented");
  }

}
