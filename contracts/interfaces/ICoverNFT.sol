// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721.sol";

interface ICoverNFT is IERC721 {

  function isApprovedOrOwner(address spender, uint tokenId) external returns (bool);

  function mint(address to) external returns (uint tokenId);

  function changeOperator(address newOperator) external;

  function totalSupply() external view returns (uint);

  function name() external view returns (string memory);

  error NotOperator();
  error NotMinted();
  error WrongFrom();
  error InvalidRecipient();
  error InvalidNewOperatorAddress();
  error InvalidNewNFTDescriptorAddress();
  error NotAuthorized();
  error UnsafeRecipient();
  error AlreadyMinted();

}
