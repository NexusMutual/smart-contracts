// SDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";

import "../../interfaces/ICover.sol";

contract ICMockCover is ICover, ERC721 {
  Cover[] public override covers;
  mapping(uint => StakingPool[]) public stakingPoolsOfCover;

  constructor (string memory name_, string memory symbol_) ERC721(name_, symbol_) {
  }

  function buyCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint96 amount,
    uint32 period,
    uint maxPrice,
    StakingPool[] calldata stakingPools
  ) external override returns (uint) {
    return _createCover(
      owner,
      productId,
      payoutAsset,
      0,
      amount,
      period,
      stakingPools
    );
  }

  function createCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint8 deniedClaims,
    uint96 amount,
    uint32 period,
    StakingPool[] calldata stakingPools
  ) external override returns (uint) {
    return _createCover(
      owner,
      productId,
      payoutAsset,
      deniedClaims,
      amount,
      period,
      stakingPools
    );
  }

  function _createCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint8 deniedClaims,
    uint amount,
    uint period,
    StakingPool[] memory stakingPools
  ) internal returns (uint) {
    uint coverId = covers.length;
    _safeMint(owner, coverId);
    covers.push(Cover(
      productId,
      uint96(amount),
      uint32(block.timestamp + 1),
      uint32(period),
      payoutAsset,
      deniedClaims,
      uint80(38200000000000000) // 1 NXM ~ 0.0382 ETH
    ));
    for (uint i=0; i < stakingPools.length; i++) {
      stakingPoolsOfCover[coverId][i] = stakingPools[i];
    }
    return coverId;
  }

  function incrementDeniedClaims(uint coverId) external override {
    covers[coverId].deniedClaims += 1;
  }

  function performPayoutBurn(uint coverId, address owner, uint amount) external override {
    Cover memory cover = covers[coverId];
    StakingPool[] memory stakingPools = stakingPoolsOfCover[coverId];
    // Perform staking burns here
    _createCover(
      owner,
      cover.productId,
      cover.payoutAsset,
      cover.deniedClaims,
      cover.amount - amount,
      cover.period - (uint32(block.timestamp) - cover.start),
      stakingPools
    );
  }
}
