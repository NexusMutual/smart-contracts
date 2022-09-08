// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";


contract CLMockUnknownNFT is ERC721 {
  constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {
  }

  function mint(address to, uint tokenId) external {
    _mint(to, tokenId);
  }

}
