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

  function tokenURI(uint) public view override returns (string memory) {
    return "";
  }

  function _operatorTransferFrom(address from, address to, uint256 tokenId) internal {
        require(from == _ownerOf[tokenId], "WRONG_FROM");

        require(to != address(0), "INVALID_RECIPIENT");

        // Underflow of the sender's balance is impossible because we check for
        // ownership above and the recipient's balance can't realistically overflow.
        unchecked {
            _balanceOf[from]--;

            _balanceOf[to]++;
        }

        _ownerOf[tokenId] = to;

        delete getApproved[tokenId];

        emit Transfer(from, to, tokenId);
  }

}
