// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../../interfaces/IStakingPool.sol";
import "../../libraries/StakingPoolLibrary.sol";
import "../../interfaces/IStakingPoolFactory.sol";
/**
 * @dev Simple library to derive the staking pool address from the pool id without external calls
 */

contract SNFTMockCover {
    IStakingPoolFactory stakingPoolFactory;

    constructor(address _stakingPoolFactory) {
        stakingPoolFactory = IStakingPoolFactory(_stakingPoolFactory);
    }

    function stakingPool(uint256 poolId) public view returns (IStakingPool) {
        return IStakingPool(
          StakingPoolLibrary.getAddress(address(stakingPoolFactory), poolId)
        );
    }
}
