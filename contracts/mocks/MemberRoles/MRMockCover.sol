// SPDX-License-Identifier: GPL-3.0-only

import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IMemberRoles.sol";
import "../../interfaces/ICoverNFT.sol";

pragma solidity ^0.8.16;

contract MRMockCover {
  ICoverNFT immutable public coverNFT;
  IMemberRoles immutable public memberRoles;
  address[] public stakingPools;

  constructor(address coverNFTAddress, address memberRolesAddress) {
    coverNFT = ICoverNFT(coverNFTAddress);
    memberRoles = IMemberRoles(memberRolesAddress);
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

  function stakingPoolTransferTokens(uint stakingPoolId, address from, address to, uint[] calldata tokenIds) external {
    IStakingPool _stakingPool = IStakingPool(stakingPools[stakingPoolId]);
    _stakingPool.operatorTransfer(from, to, tokenIds);
  }
}
