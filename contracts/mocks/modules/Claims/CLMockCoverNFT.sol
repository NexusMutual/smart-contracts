// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../tokens/ERC721Mock.sol";

contract CLMockCoverNFT is ERC721Mock {

  constructor() ERC721Mock("", "") {}

  function mint(address to) external returns (uint tokenId) {
    tokenId = ++totalSupply;
    _mint(to, tokenId);
  }

}
