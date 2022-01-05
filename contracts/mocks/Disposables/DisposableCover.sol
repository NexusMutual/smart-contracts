// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/ICover.sol";

contract DisposableCover is MasterAwareV2 {

  ICover.Product[] public products;
  ICover.ProductType[] public productTypes;

  mapping(uint => ICover.CoverData) public covers;
  mapping(uint => ICover.PoolAllocation[]) public coverAllocations;

  mapping(uint => uint) initialPrices;

  mapping(uint => uint96) public activeCoverAmountInNXM;

  uint32 public capacityFactor;
  uint32 public coverCount;
  address public coverNFT;


  /* === CONSTANTS ==== */

  uint public REWARD_BPS = 5000;
  uint public constant PERCENTAGE_CHANGE_PER_DAY_BPS = 100;
  uint public constant BASIS_PRECISION = 10000;
  uint public constant STAKE_SPEED_UNIT = 100000e18;
  uint public constant PRICE_CURVE_EXPONENT = 7;
  uint public constant MAX_PRICE_PERCENTAGE = 1e20;

  /* ========== CONSTRUCTOR ========== */

  constructor() {
  }

  function initialize(address _coverNFT) public {
    require(coverNFT == address(0), "Cover: already initialized");
    coverNFT = _coverNFT;
  }

  function addProductType(ICover.ProductType calldata productType) public {
    productTypes.push(productType);
  }

  function addProduct(ICover.Product calldata product) public {
    products.push(product);
  }

  function changeDependentContractAddress() external override {}

}
