// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.4;

import "@openzeppelin/contracts-v4/token/ERC721/ERC721.sol";

contract ERC721Mock is ERC721 {

  constructor(string memory name, string memory symbol) ERC721(name, symbol) {
    /* noop */
  }

  function mint(address to, uint tokenId) external {
    _mint(to, tokenId);
  }

  function isApprovedOrOwner(address spender, uint256 tokenId) external view returns (bool) {
    return _isApprovedOrOwner(spender, tokenId);
  }

}
