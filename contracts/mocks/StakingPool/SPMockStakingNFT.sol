// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.4;

import "../Tokens/ERC721Mock.sol";

contract SPMockStakingNFT is ERC721Mock {

  constructor() ERC721Mock("", "") {}

  function mint(uint /*poolId*/, address to) external returns (uint) {
    uint tokenId = totalSupply++;
    _mint(to, tokenId);
    return tokenId;
  }

}
