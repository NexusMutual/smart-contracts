pragma solidity ^0.5.0;

import "../../modules/governance/MemberRoles.sol";
import "../../modules/token/TokenController.sol";

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
    launchedOn = now;

    require(
      _initialMembers.length == _initialMemberTokens.length,
      "initial members and member tokens arrays should have the same length"
    );

    tc = TokenController(_tokenControllerAddress);
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
  }

}
