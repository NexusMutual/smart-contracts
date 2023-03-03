// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IMemberRoles.sol";

contract MRMockCover {

  ICoverNFT immutable public coverNFT;
  IMemberRoles immutable public memberRoles;
  IStakingNFT immutable public stakingNFT;
  address[] public stakingPools;

  constructor(address coverNFTAddress, address memberRolesAddress, address stakingNFTAddress) {
    coverNFT = ICoverNFT(coverNFTAddress);
    memberRoles = IMemberRoles(memberRolesAddress);
    stakingNFT = IStakingNFT(stakingNFTAddress);
  }

  function transferCovers(address from, address to, uint256[] calldata tokenIds) external {
    for (uint256 i = 0; i < tokenIds.length; i++) {
      coverNFT.transferFrom(from, to, tokenIds[i]);
    }
  }

  function transferStakingPoolTokens(address from, address to, uint256[] calldata tokenIds) external {
    for (uint256 i = 0; i < tokenIds.length; i++) {
      stakingNFT.transferFrom(from, to, tokenIds[i]);
    }
  }

  function createMockCover(address to) public returns (uint tokenId) {
    return coverNFT.mint(to);
  }
}
