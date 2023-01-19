// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../interfaces/ICover.sol";
import "../../interfaces/INXMMaster.sol";
import "../../interfaces/IStakingPool.sol";
import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingPoolFactory.sol";
import "../../libraries/StakingPoolLibrary.sol";

contract StakingViewer {

  struct StakingPoolDetails {
    uint poolId;
    bool isPrivatePool;
    address manager;
    uint8 poolFee;
    uint8 maxPoolFee;
    uint activeStake;
    uint currentAPY;
  }

  INXMMaster internal immutable master;
  IStakingNFT public immutable stakingNFT;
  IStakingPoolFactory public immutable stakingPoolFactory;

  constructor(
    INXMMaster _master,
    IStakingNFT _stakingNFT,
    IStakingPoolFactory _stakingPoolFactory
  ) {
    master = _master;
    stakingNFT = _stakingNFT;
    stakingPoolFactory = _stakingPoolFactory;
  }

  function cover() internal view returns (ICover) {
    return ICover(master.contractAddresses('CO'));
  }

  function stakingPool(uint poolId) public view returns (IStakingPool) {
    return IStakingPool(
      StakingPoolLibrary.getAddress(address(stakingPoolFactory), poolId)
    );
  }

  function getStakingPoolDetails(
    uint[] calldata tokenIds
  ) public view returns (StakingPoolDetails[] memory stakingPoolDetails) {

    stakingPoolDetails = new StakingPoolDetails[](tokenIds.length);

    for (uint i = 0; i < tokenIds.length; i++) {
      uint poolId = stakingNFT.stakingPoolOf(tokenIds[i]);
      IStakingPool pool = stakingPool(poolId);

      stakingPoolDetails[i].poolId = poolId;
      stakingPoolDetails[i].isPrivatePool = pool.isPrivatePool();
      stakingPoolDetails[i].manager = pool.manager();
      stakingPoolDetails[i].poolFee = pool.poolFee();
      stakingPoolDetails[i].maxPoolFee = pool.maxPoolFee();
      stakingPoolDetails[i].activeStake = pool.activeStake();
      stakingPoolDetails[i].currentAPY = pool.rewardPerSecond() * 365 days / pool.activeStake();
    }

    return stakingPoolDetails;
  }
}
