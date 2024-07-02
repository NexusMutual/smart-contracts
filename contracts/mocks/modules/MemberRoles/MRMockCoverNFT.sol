// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../tokens/ERC721Mock.sol";

contract MRMockCoverNFT is ERC721Mock {

  constructor(string memory name, string memory symbol) ERC721Mock(name, symbol) {
    /* noop */
  }

  function mint(address to) external returns (uint tokenId) {
    tokenId = ++totalSupply;
    _mint(to, tokenId);
  }

  function operatorTransferFrom(address from, address to, uint256 tokenId) external {
      _operatorTransferFrom(from, to, tokenId);
  }
}
