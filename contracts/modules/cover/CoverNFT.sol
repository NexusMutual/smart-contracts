// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../interfaces/ICover.sol";
import "solmate/src/tokens/ERC721.sol";

contract CoverNFT is ERC721 {

  // TODO: consider adding totalSupply()

  address public operator;

  modifier onlyOperator {
    require(msg.sender == operator, "CoverNFT: Not operator");
    _;
  }

  constructor(string memory name_, string memory symbol_, address _operator) ERC721(name_, symbol_) {
    operator = _operator;
  }

  function tokenURI(uint256) public pure override returns (string memory) {
    // TODO: implement me
    return "";
  }

  function isApprovedOrOwner(address spender, uint tokenId) external view returns (bool) {
    address owner = ownerOf(tokenId);
    return spender == owner || isApprovedForAll[owner][spender] || spender == getApproved[tokenId];
  }

  function mint(address to, uint tokenId) external onlyOperator {
    _mint(to, tokenId);
  }

  function burn(uint tokenId) external onlyOperator {
    _burn(tokenId);
  }

  function operatorTransferFrom(address from, address to, uint256 tokenId) external onlyOperator {

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

  function changeOperator(address _newOperator) public onlyOperator returns (bool) {
    require(_newOperator != address(0), "CoverNFT: Invalid newOperator address");

    operator = _newOperator;
    return true;
  }
}
