// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IStakingNFT.sol";

contract StakingNFTGeneric is IStakingNFT {
  mapping(uint => address) public getApproved;
  mapping(address => mapping(address => bool)) public isApprovedForAll;

  function isApprovedOrOwner(address, uint) external pure returns (bool) {
    revert("Unsupported");
  }

  function mint(uint, address) external pure returns (uint) {
    revert("Unsupported");
  }

  function changeOperator(address) external pure {
    revert("Unsupported");
  }

  function totalSupply() external pure returns (uint) {
    revert("Unsupported");
  }

  function tokenInfo(uint) external pure returns (uint, address) {
    revert("Unsupported");
  }

  function stakingPoolOf(uint) external pure returns (uint) {
    revert("Unsupported");
  }

  function stakingPoolFactory() external pure returns (address) {
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

  function changeNFTDescriptor(address) external virtual {
    revert("Unsupported");
  }
}
