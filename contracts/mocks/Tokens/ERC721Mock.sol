// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.4;

import "solmate/src/tokens/ERC721.sol";

contract ERC721Mock is ERC721 {

  constructor(string memory name, string memory symbol) ERC721(name, symbol) {
    /* noop */
  }

  function mint(address to, uint tokenId) external {
    _mint(to, tokenId);
  }

  function isApprovedOrOwner(address spender, uint256 tokenId) external view returns (bool) {
    address owner = ownerOf(tokenId);
    return spender == owner || isApprovedForAll[owner][spender] || spender == getApproved[tokenId];
  }

  function tokenURI(uint id) public view override returns (string memory) {
    id; 
    return "";
  }


}
