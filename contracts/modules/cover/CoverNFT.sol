// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../interfaces/ICover.sol";
import "solmate/src/tokens/ERC721.sol";

// TODO: implement ICoverNFT instead
contract CoverNFT is ERC721 {

  uint96 internal _totalSupply;

  address public operator;

  modifier onlyOperator {
    require(msg.sender == operator, "CoverNFT: Not operator");
    _;
  }

  constructor(string memory name_, string memory symbol_, address _operator) ERC721(name_, symbol_) {
    operator = _operator;
  }

  function totalSupply() public view returns (uint) {
    return _totalSupply;
  }

  // TODO: implement change token descriptor function here

  function tokenURI(uint256) public pure override returns (string memory) {
    // TODO: implement me
    return "";
  }

  function isApprovedOrOwner(address spender, uint tokenId) external view returns (bool) {
    address owner = ownerOf(tokenId);
    return spender == owner || isApprovedForAll[owner][spender] || spender == getApproved[tokenId];
  }

  function mint(address to) external onlyOperator returns (uint tokenId) {
    tokenId = ++_totalSupply;
    _mint(to, tokenId);
  }

  function changeOperator(address _newOperator) public onlyOperator returns (bool) {
    require(_newOperator != address(0), "CoverNFT: Invalid newOperator address");

    operator = _newOperator;
    return true;
  }
}
