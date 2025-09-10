// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "../../modules/governance/Registry.sol";

contract TestnetRegistry is Registry {

  constructor(
    address _verifyingAddress,
    address _masterAddress
  ) Registry(_verifyingAddress, _masterAddress) { }

  function recoverSigner(
    bytes memory /* message */,
    bytes memory /* signature */
  ) internal view override returns (address) {
    return membersMeta.kycAuthAddress;
  }

}
