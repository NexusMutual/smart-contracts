// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.8.4;

//import "solmate/src/tokens/ERC721.sol";
import "../../modules/cover/CoverNFT.sol";

contract CoverMockNFT is CoverNFT {

  constructor(string memory name_, string memory symbol_, address operator) CoverNFT(name_, symbol_, operator) {}

  function setMockOperator(address operator_) public {
    operator = operator_;
  }
}
