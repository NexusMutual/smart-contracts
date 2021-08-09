// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;

contract AssessmentMockPool {

  function sendClaimPayout(
    address asset,
    address payable payoutAddress,
    uint amount
  ) public returns (bool) {
    return true;
  }
}
