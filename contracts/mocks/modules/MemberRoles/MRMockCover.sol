// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/ICoverNFT.sol";
import "../../../interfaces/IStakingNFT.sol";
import "../../../interfaces/IStakingPool.sol";
import "../../../interfaces/IMemberRoles.sol";
import "../../generic/CoverGeneric.sol";

contract MRMockCover is CoverGeneric {

  ICoverNFT immutable public _coverNFT;
  IMemberRoles immutable public _memberRoles;
  IStakingNFT immutable public _stakingNFT;
  address[] public stakingPools;

  constructor(address coverNFTAddress, address memberRolesAddress, address stakingNFTAddress) {
    _coverNFT = ICoverNFT(coverNFTAddress);
    _memberRoles = IMemberRoles(memberRolesAddress);
    _stakingNFT = IStakingNFT(stakingNFTAddress);
  }

  function transferCovers(address from, address to, uint256[] calldata tokenIds) external {
    for (uint256 i = 0; i < tokenIds.length; i++) {
      _coverNFT.transferFrom(from, to, tokenIds[i]);
    }
  }

  function transferStakingPoolTokens(address from, address to, uint256[] calldata tokenIds) external {
    for (uint256 i = 0; i < tokenIds.length; i++) {
      _stakingNFT.transferFrom(from, to, tokenIds[i]);
    }
  }

  function createMockCover(address to) public returns (uint tokenId) {
    return _coverNFT.mint(to);
  }

  function coverNFT() external override view returns (ICoverNFT) {
    return _coverNFT;
  }

  function stakingNFT() external override view returns (IStakingNFT) {
    return _stakingNFT;
  }

  function memberRoles() external view returns (IMemberRoles) {
    return _memberRoles;
  }
}
