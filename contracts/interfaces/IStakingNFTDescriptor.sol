// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

  struct DepositExpiryInfo {
    uint trancheId;
    uint stake;
  }

  struct StakingTokenURIParams {
    uint tokenId;
    uint poolId;
    address stakingPool;
    address owner;
    string name;
  }

interface IStakingNFTDescriptor {

  function tokenURI(StakingTokenURIParams calldata params) external view returns (string memory);

}
