// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../interfaces/IStakingPoolBeacon.sol";
import "../../interfaces/IProductsV1.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/ICover.sol";

import "./MinimalBeaconProxy.sol";
import "../../interfaces/IStakingPoolCreator.sol";


contract StakingPoolCreator is IStakingPoolCreator, IStakingPoolBeacon {

  bytes32 public immutable stakingPoolProxyCodeHash;
  address public immutable stakingPoolImplementation;

  address coverAddress;
  uint64 public stakingPoolCounter;

  event StakingPoolCreated(address stakingPoolAddress, address manager, address stakingPoolImplementation);

  constructor(
    address _stakingPoolImplementation,
    address _coverAddress
  ) {

    // initialize immutable fields only
    stakingPoolProxyCodeHash = keccak256(
      abi.encodePacked(
        type(MinimalBeaconProxy).creationCode,
        abi.encode(_coverAddress)
      )
    );
    stakingPoolImplementation =  _stakingPoolImplementation;
    coverAddress = _coverAddress;
  }

  function createStakingPool(
    address manager,
    ProductInitializationParams[] calldata params
  ) external returns (address stakingPoolAddress) {

    stakingPoolAddress = address(
      new MinimalBeaconProxy{ salt: bytes32(uint(stakingPoolCounter)) }(coverAddress)
    );
    IStakingPool(stakingPoolAddress).initialize(manager, params);

    stakingPoolCounter++;

    emit StakingPoolCreated(stakingPoolAddress, manager, stakingPoolImplementation);
  }

  function stakingPool(uint index) public view returns (IStakingPool) {

    bytes32 hash = keccak256(
      abi.encodePacked(bytes1(0xff), coverAddress, index, stakingPoolProxyCodeHash)
    );
    // cast last 20 bytes of hash to address
    return IStakingPool(address(uint160(uint(hash))));
  }
}