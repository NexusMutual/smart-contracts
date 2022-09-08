// SPDX-License-Identifier: GPL-3.0-only

import "../../interfaces/IStakingPool.sol";
import "../../interfaces/ICoverNFT.sol";

pragma solidity ^0.8.9;

contract MRMockCover {
  ICoverNFT immutable public coverNFT;
  address[] public stakingPools;

  constructor(address coverNFTAddress) {
    coverNFT = ICoverNFT(coverNFTAddress);
  }

  function transferCovers(address from, address to, uint256[] calldata coverIds) external {
    for (uint256 i = 0; i < coverIds.length; i++) {
      coverNFT.operatorTransferFrom(from, to, coverIds[i]);
    }
  }

  function addStakingPools(address[] calldata stakingPoolAddresses) public {
    for (uint i = 0; i < stakingPoolAddresses.length; i++) {
      stakingPools.push(stakingPoolAddresses[i]);
    }
  }

  function stakingPool(uint index) public view returns (IStakingPool) {
    return IStakingPool(stakingPools[index]);
  }

  function createMockCover(address to, uint tokenId) public {
    coverNFT.mint(to, tokenId);
  }

}
