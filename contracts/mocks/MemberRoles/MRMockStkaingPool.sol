// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

import "../Tokens/ERC721Mock.sol";

contract MRMockStakingPool is ERC721Mock {

  constructor(string memory name, string memory symbol) ERC721Mock(name, symbol) {
    /* noop */
  }

  function operatorTransfer(
    address from,
    address to,
    uint[] calldata tokenIds
  ) external {
    uint length = tokenIds.length;
    for (uint i = 0; i < length; i++) {
      _operatorTransferFrom(from, to, tokenIds[i]);
    }
  }
  
  function operatorTransferFrom(address from, address to, uint256 tokenId) internal {

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
