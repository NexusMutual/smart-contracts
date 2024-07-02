// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../modules/governance/MemberRoles.sol";

contract TestnetMemberRoles is MemberRoles {

  constructor(address tokenAddress) MemberRoles(tokenAddress) {
  }

  function joinOnTestnet(address _userAddress) public {

    require(!isMember(_userAddress), "MemberRoles: This address is already a member");

    tokenController().addToWhitelist(_userAddress);
    _updateRole(_userAddress, uint(Role.Member), true);

    emit MemberJoined(_userAddress, 0);
  }

}
