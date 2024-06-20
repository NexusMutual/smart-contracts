// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IStakingNFTDescriptor {

  struct StakeData {
    uint poolId;
    uint stakeAmount;
    uint tokenId;
  }

  function tokenURI(uint tokenId) external view returns (string memory);

}
