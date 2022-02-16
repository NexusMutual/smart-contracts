// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../interfaces/IGovernance.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/ITokenController.sol";

contract VotePower {

  string constant public name = "NXM balance with delegations";
  string constant public symbol = "NXMD";
  uint8 constant public decimals = 18;

  INXMMaster immutable public master;

  enum Role {UnAssigned, AdvisoryBoard, Member}

  constructor(INXMMaster _master) {
    master = _master;
  }

  function totalSupply() public view returns (uint) {
    return INXMToken(master.tokenAddress()).totalSupply();
  }

  function balanceOf(address member) public view returns (uint) {

    ITokenController tokenController = ITokenController(master.dAppLocker());
    IMemberRoles memberRoles = IMemberRoles(master.getLatestAddress("MR"));
    IGovernance governance = IGovernance(master.getLatestAddress("GV"));

    if (!memberRoles.checkRole(member, uint(Role.Member))) {
      return 0;
    }

    uint delegationId = governance.followerDelegation(member);

    if (delegationId != 0) {
      (, address leader,) = governance.allDelegation(delegationId);
      if (leader != address(0)) {
        return 0;
      }
    }

    uint balance = tokenController.totalBalanceOf(member) + 1e18;
    uint[] memory delegationIds = governance.getFollowers(member);

    for (uint i = 0; i < delegationIds.length; i++) {

      (address follower, address leader,) = governance.allDelegation(delegationIds[i]);

      if (
        leader != member ||
        !memberRoles.checkRole(follower, uint(Role.Member))
      ) {
        continue;
      }

      balance += tokenController.totalBalanceOf(follower) + 1e18;
    }

    return balance;
  }

}
