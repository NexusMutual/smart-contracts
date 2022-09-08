// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "solmate/src/tokens/ERC721.sol";


contract CLMockUnknownNFT is ERC721 {
  constructor(string memory name_, string memory symbol_) ERC721(name_, symbol_) {
  }

  function mint(address to, uint tokenId) external {
    _mint(to, tokenId);
  }

  function tokenURI(uint id) public view override returns (string memory) {
    id; 
    return "";
  }

}
