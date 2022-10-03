pragma solidity ^0.8.0;

import "../../interfaces/ICover.sol";

contract CoverMockProductStaking {

  mapping(uint => Product) internal _products;

  function products(uint id) external view returns (Product memory) {
    return _products[id];
  }

  function setProduct(Product memory product_, uint id) public {
    _products[id] = product_;
  }

  function initializeStaking(
    address staking_,
    address _manager,
    bool _isPrivatePool,
    uint _initialPoolFee,
    uint _maxPoolFee,
    ProductInitializationParams[] calldata params,
    uint _poolId
  ) external {
      IStakingPool(staking_).initialize(_manager, _isPrivatePool, _initialPoolFee, _maxPoolFee, params, _poolId);
  }
}
