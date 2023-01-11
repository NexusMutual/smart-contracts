// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.4;

import "../Tokens/ERC721Mock.sol";

contract CoverMockStakingNFT is ERC721Mock {

  constructor() ERC721Mock("", "") {}

  function mint(address to) external {
    _mint(to, totalSupply++);
  }

}
