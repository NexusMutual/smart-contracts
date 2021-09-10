// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";

import "../../interfaces/ICover.sol";

contract AssessmentMockCover is ICover, ERC721 {
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
  ) external payable override returns (uint) {
    return _createCover(
      owner,
      productId,
      payoutAsset,
      amount,
      period,
      stakingPools
    );
  }

  function createCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint96 amount,
    uint32 period,
    StakingPool[] calldata stakingPools
  ) external override returns (uint) {
    return _createCover(
      owner,
      productId,
      payoutAsset,
      amount,
      period,
      stakingPools
    );
  }

  function _createCover(
    address owner,
    uint24 productId,
    uint8 payoutAsset,
    uint amount,
    uint period,
    StakingPool[] memory stakingPools
  ) internal returns (uint) {
    uint coverId = covers.length;
    _safeMint(owner, coverId);
    covers.push(Cover(
      productId,
      payoutAsset,
      uint96(amount),
      uint32(block.timestamp + 1),
      uint32(period),
      0 // mock price
    ));
    for (uint i=0; i < stakingPools.length; i++) {
      stakingPoolsOfCover[coverId][i] = stakingPools[i];
    }
    return coverId;
  }

  function editCover(
    uint coverId,
    uint24 productId,
    uint8 payoutAsset,
    uint96 amount,
    uint start,
    uint period,
    StakingPool[] calldata stakingPools
  ) public {
    covers[coverId] = Cover(
      productId,
      payoutAsset,
      amount,
      uint32(start),
      uint32(period),
      0 // mock price
    );
  }

  function performPayoutBurn(uint coverId, address owner, uint amount) external override {
    Cover memory cover = covers[coverId];
    StakingPool[] memory stakingPools = stakingPoolsOfCover[coverId];
    // Perform staking burns here
    _createCover(
      owner,
      cover.productId,
      cover.payoutAsset,
      cover.amount - amount,
      cover.period - (uint32(block.timestamp) - cover.start),
      stakingPools
    );
  }
}
