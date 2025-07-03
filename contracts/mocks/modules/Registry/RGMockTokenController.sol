// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../generic/TokenControllerGeneric.sol";

contract RGMockTokenController is TokenControllerGeneric {

  event AddToWhitelistCalled(address member);
  event RemoveFromWhitelistCalled(address member);
  event SwitchMembershipAddressWithTransferCalled(address member, address to);

  uint internal dummyWrite;

  function addToWhitelist(address member) external override {
    dummyWrite = dummyWrite;
    emit AddToWhitelistCalled(member);
  }

  function removeFromWhitelist(address member) external override {
    dummyWrite = dummyWrite;
    emit RemoveFromWhitelistCalled(member);
  }

  function switchMembershipAddressWithTransfer(address member, address to) external override {
    dummyWrite = dummyWrite;
    emit SwitchMembershipAddressWithTransferCalled(member, to);
  }
}
