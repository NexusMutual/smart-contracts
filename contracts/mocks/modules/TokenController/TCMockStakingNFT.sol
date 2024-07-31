// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../tokens/ERC721Mock.sol";

contract TCMockStakingNFT is ERC721Mock {

  constructor() ERC721Mock("", "") {}

  mapping(uint => uint) public _stakingPoolOf;

  function mint(uint poolId, address to) external returns (uint) {
    uint tokenId = ++totalSupply;
    _mint(to, tokenId);
    _stakingPoolOf[tokenId] = poolId;
    return tokenId;
  }

  function stakingPoolOf(uint tokenId) external view returns (uint) {
    // ownerOf will revert for non-existing tokens which is what we want here
    ownerOf(tokenId);
    return _stakingPoolOf[tokenId];
  }

}
