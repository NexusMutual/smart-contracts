// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IStakingNFTDescriptor.sol";

contract StakingNFTDescriptorGeneric is IStakingNFTDescriptor {

  function tokenURI(uint) external pure returns (string memory) {
    revert("Unsupported");
  }

}
