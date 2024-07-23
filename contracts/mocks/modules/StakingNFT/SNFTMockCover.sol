// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../interfaces/IStakingNFT.sol";
import "../../../interfaces/IStakingPool.sol";
import "../../../interfaces/IStakingPoolFactory.sol";
import "../../../libraries/StakingPoolLibrary.sol";
import "../../generic/CoverGeneric.sol";
/**
 * @dev Simple library to derive the staking pool address from the pool id without external calls
 */

contract SNFTMockCover is CoverGeneric {
    IStakingPoolFactory stakingPoolFactory;
    IStakingNFT stakingNFT;

    constructor(address _stakingPoolFactory) {
        stakingPoolFactory = IStakingPoolFactory(_stakingPoolFactory);
    }

    function setStakingNFT(address _stakingNFT) public {
        stakingNFT = IStakingNFT(_stakingNFT);
    }

    function transferFrom(address from, address to, uint id) external {
      // get staking nft from factory
      stakingNFT.transferFrom(from, to, id);
    }

    function stakingPool(uint256 poolId) public view returns (IStakingPool) {
        return IStakingPool(
          StakingPoolLibrary.getAddress(address(stakingPoolFactory), poolId)
        );
    }
}
