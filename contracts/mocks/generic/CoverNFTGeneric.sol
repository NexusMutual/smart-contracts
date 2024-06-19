// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/ICoverNFT.sol";
import "../tokens/ERC721Mock.sol";

contract CoverNFTGeneric is ICoverNFT {
  mapping(uint => address) public getApproved;
  mapping(address => mapping(address => bool)) public isApprovedForAll;

  function isApprovedOrOwner(address, uint) external pure returns (bool) {
    revert("Unsupported");
  }

  function mint(address) external pure returns (uint) {
    revert("Unsupported");
  }

  function changeOperator(address) external pure {
    revert("Unsupported");
  }

  function changeNFTDescriptor(address) external pure {
    revert("Unsupported");
  }

  function totalSupply() external pure returns (uint) {
    revert("Unsupported");
  }

  function name() external pure returns (string memory) {
    revert("Unsupported");
  }

  function approve(address, uint) external pure {
    revert("Unsupported");
  }

  function balanceOf(address) public pure returns (uint) {
    revert("Unsupported");
  }

  function ownerOf(uint) public pure returns (address) {
    revert("Unsupported");
  }

  function safeTransferFrom(address, address, uint) external pure {
    revert("Unsupported");
  }

  function safeTransferFrom(address, address, uint, bytes calldata) external pure {
    revert("Unsupported");
  }

  function transferFrom(address, address, uint) external pure {
    revert("Unsupported");
  }

  function setApprovalForAll(address, bool) public pure {
    revert("Unsupported");
  }

  function supportsInterface(bytes4) public pure returns (bool) {
    revert("Unsupported");
  }
}
