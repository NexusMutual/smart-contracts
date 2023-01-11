// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.4;

import "../Tokens/ERC721Mock.sol";

contract CoverMockCoverNFT is ERC721Mock {

  constructor() ERC721Mock("", "") {}

  function mint(address to, uint tokenId) external {
    totalSupply++;
    _mint(to, tokenId);
  }

}
