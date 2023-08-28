// SPDX-License-Identifier: AGPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IStakingPoolFactory.sol";
import "./MinimalBeaconProxy.sol";

contract StakingPoolFactory is IStakingPoolFactory {

  address public operator;
  uint96 internal _stakingPoolCount;

  // temporary beacon address storage to avoid constructor arguments in the proxy
  address public beacon;

  constructor(address _operator) {
    operator = _operator;
  }

  function changeOperator(address newOperator) public {
    require(msg.sender == operator, "StakingPoolFactory: Not operator");
    require(newOperator != address(0), "StakingPoolFactory: Invalid operator");
    operator = newOperator;
  }

  function stakingPoolCount() external view returns (uint) {
    return _stakingPoolCount;
  }

  function create(address _beacon) external returns (uint poolId, address stakingPoolAddress) {

    require(msg.sender == operator, "StakingPoolFactory: Not operator");

    beacon = _beacon;
    poolId = ++_stakingPoolCount;

    stakingPoolAddress = address(
      new MinimalBeaconProxy{salt : bytes32(poolId)}()
    );

    require(
      stakingPoolAddress != address(0),
      "StakingPoolFactory: Failed to create staking pool"
    );

    emit StakingPoolCreated(poolId, stakingPoolAddress);
  }
}
