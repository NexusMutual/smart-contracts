// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/ITokenController.sol";
import "../../modules/governance/MemberRoles.sol";

contract DisposableMemberRoles is MemberRoles {

  function initialize(
    address _owner,
    address _masterAddress,
    address _tokenControllerAddress,
    address[] calldata _initialMembers,
    uint[] calldata _initialMemberTokens,
    address[] calldata _initialABMembers
  ) external {

    require(!constructorCheck);
    constructorCheck = true;
    launched = true;
    launchedOn = block.timestamp;

    require(
      _initialMembers.length == _initialMemberTokens.length,
      "initial members and member tokens arrays should have the same length"
    );

    tc = ITokenController(_tokenControllerAddress);
    changeMasterAddress(_masterAddress);

    _addInitialMemberRoles(_owner, _owner);

    for (uint i = 0; i < _initialMembers.length; i++) {
      _updateRole(_initialMembers[i], uint(Role.Member), true);
      tc.addToWhitelist(_initialMembers[i]);
      tc.mint(_initialMembers[i], _initialMemberTokens[i]);
    }

    require(_initialABMembers.length <= maxABCount);

    for (uint i = 0; i < _initialABMembers.length; i++) {
      _updateRole(_initialABMembers[i], uint(Role.AdvisoryBoard), true);
    }

    // _unused2 was previously used by the claimPayoutAddress mapping which is only used by armor.
    // The purpose of this initialization is to be able to check the storage cleanup in integration
    // tests.
    _unused2[0x181Aea6936B407514ebFC0754A37704eB8d98F91] = payable(0x1337DEF18C680aF1f9f45cBcab6309562975b1dD);
  }

}
