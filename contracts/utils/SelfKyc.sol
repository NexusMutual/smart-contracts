// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../interfaces/IMemberRoles.sol";

contract SelfKyc {
  IMemberRoles public memberRoles;

  constructor(IMemberRoles _memberRoles) {
    memberRoles = _memberRoles;
  }

  function joinMutual(address payable member) external payable {
    memberRoles.payJoiningFee{value: msg.value }(member);
    memberRoles.kycVerdict(member, true);
  }

  function approveKyc(address payable member) external payable {
    memberRoles.kycVerdict(member, true);
  }
}
