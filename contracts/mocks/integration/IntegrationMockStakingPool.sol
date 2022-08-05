// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts-v4/utils/Strings.sol";

import "../../modules/staking/StakingPool.sol";

contract IntegrationMockStakingPool is StakingPool {

  constructor (
    address _nxm,
    address _coverContract,
    ITokenController _tokenController
  )
    StakingPool("Nexus Mutual Staking Pool", "NMSPT", _nxm, _coverContract, _tokenController)
  {
  }

  function initialize(address _manager, uint _poolId) external /*override*/ {
    _mint(_manager, totalSupply++);
    poolId = _poolId;
  }


  function stake(uint amount) external {
    _mint(msg.sender, amount);
  }

  function freeCapacity(
    uint productId,
    uint previousPeriod,
    uint previousStartTime,
    uint previousRewardAmount,
    uint periodReduction,
    uint coveredAmount
  ) external /*override*/ {
    // no-op
  }

  function setTargetWeight(uint productId, uint8 weight) external {
    products[productId].targetWeight = weight;
  }

  function setTargetPrice(uint productId, uint amount) external {
    products[productId].targetPrice = uint96(amount);
  }

  function changeMasterAddress(address payable _a) external {
    // noop
  }

  function changeDependentContractAddress() external {
    // noop
  }
}
