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

    launched = true;
    launchedOn = block.timestamp;

    require(
      _initialMembers.length == _initialMemberTokens.length,
      "initial members and member tokens arrays should have the same length"
    );

    ITokenController _tokenController = ITokenController(_tokenControllerAddress);
    internalContracts[uint(ID.TC)] = payable(_tokenControllerAddress);
    changeMasterAddress(_masterAddress);

    _addInitialMemberRoles(_owner, _owner);

    for (uint i = 0; i < _initialMembers.length; i++) {
      _updateRole(_initialMembers[i], uint(Role.Member), true);
      _tokenController.addToWhitelist(_initialMembers[i]);
      _tokenController.mint(_initialMembers[i], _initialMemberTokens[i]);
    }

    require(_initialABMembers.length <= maxABCount);

    for (uint i = 0; i < _initialABMembers.length; i++) {
      _updateRole(_initialABMembers[i], uint(Role.AdvisoryBoard), true);
    }
  }

  /**
   * @dev to add initial member roles
   * @param _firstAB is the member address to be added
   * @param memberAuthority is the member authority(role) to be added for
   */
  function _addInitialMemberRoles(address _firstAB, address memberAuthority) internal {
    maxABCount = 5;
    _addRole("Unassigned", "Unassigned", address(0));
    _addRole(
      "Advisory Board",
      "Selected few members that are deeply entrusted by the dApp. An ideal advisory board should be a mix of skills of domain, governance, research, technology, consulting etc to improve the performance of the dApp.", //solhint-disable-line
      address(0)
    );
    _addRole(
      "Member",
      "Represents all users of Mutual.", //solhint-disable-line
      memberAuthority
    );
    _addRole(
      "Owner",
      "Represents Owner of Mutual.", //solhint-disable-line
      address(0)
    );
    // _updateRole(_firstAB, uint(Role.AdvisoryBoard), true);
    _updateRole(_firstAB, uint(Role.Owner), true);
    // _updateRole(_firstAB, uint(Role.Member), true);
    launchedOn = 0;
  }

}
