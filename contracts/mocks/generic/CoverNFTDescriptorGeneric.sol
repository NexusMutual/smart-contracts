// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/ICoverNFTDescriptor.sol";

contract CoverNFTDescriptorGeneric is ICoverNFTDescriptor {

  function tokenURI(uint) external pure returns (string memory) {
    revert("Unsupported");
  }
}
