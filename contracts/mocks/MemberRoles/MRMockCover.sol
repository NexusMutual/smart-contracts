// SPDX-License-Identifier: GPL-3.0-only

import "../../interfaces/ICoverNFT.sol";
import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IMemberRoles.sol";

pragma solidity ^0.8.16;

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
      coverNFT.operatorTransferFrom(from, to, tokenIds[i]);
    }
  }

  function transferStakingPoolTokens(address from, address to, uint256[] calldata tokenIds) external {
    for (uint256 i = 0; i < tokenIds.length; i++) {
      stakingNFT.operatorTransferFrom(from, to, tokenIds[i]);
    }
  }

  function createMockCover(address to, uint tokenId) public {
    coverNFT.mint(to, tokenId);
  }

  function stakingPoolTransferTokens(uint stakingPoolId, address from, address to, uint[] calldata tokenIds) external {
    IStakingPool _stakingPool = IStakingPool(stakingPools[stakingPoolId]);
    _stakingPool.operatorTransfer(from, to, tokenIds);
  }
}
