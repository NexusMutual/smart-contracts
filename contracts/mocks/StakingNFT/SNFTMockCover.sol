// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../../interfaces/IStakingNFT.sol";
import "../../interfaces/IStakingPool.sol";
import "../../libraries/StakingPoolLibrary.sol";
import "../../interfaces/IStakingPoolFactory.sol";
/**
 * @dev Simple library to derive the staking pool address from the pool id without external calls
 */

contract SNFTMockCover {
    IStakingPoolFactory stakingPoolFactory;
    IStakingNFT stakingNFT;

    constructor(address _stakingPoolFactory) {
        stakingPoolFactory = IStakingPoolFactory(_stakingPoolFactory);
    }

    function setStakingNFT(address _stakingNFT) public {
        stakingNFT = IStakingNFT(_stakingNFT);
    }

    function operatorTransferFrom(address from, address to, uint id) external {
      stakingNFT.operatorTransferFrom(from, to, id);
        // Get staking nft from factory
    }

    function stakingPool(uint256 poolId) public view returns (IStakingPool) {
        return IStakingPool(
          StakingPoolLibrary.getAddress(address(stakingPoolFactory), poolId)
        );
    }
}
