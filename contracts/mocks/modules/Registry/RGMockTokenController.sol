  // SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../generic/TokenControllerGeneric.sol";

contract RGMockTokenController is TokenControllerGeneric {

  event AddToWhitelistCalled(address member);
  event RemoveFromWhitelistCalled(address member);
  event SwitchMembershipCalledWith(address member, address to, bool includeNxmTokens);

  uint internal dummyWrite;

  function addToWhitelist(address member) external override {
    dummyWrite = dummyWrite;
    emit AddToWhitelistCalled(member);
  }

  function removeFromWhitelist(address member) external override {
    dummyWrite = dummyWrite;
    emit RemoveFromWhitelistCalled(member);
  }

  function switchMembership(address member, address to, bool includeNxmTokens) external override {
    dummyWrite = dummyWrite;
    emit SwitchMembershipCalledWith(member, to, includeNxmTokens);
  }
}
