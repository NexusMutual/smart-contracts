// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721.sol";

interface IStakingNFT is IERC721 {

  function isApprovedOrOwner(address spender, uint tokenId) external returns (bool);

  function mint(uint poolId, address to) external returns (uint tokenId);

  function changeOperator(address newOperator) external;

  function totalSupply() external returns (uint);

  function tokenInfo(uint tokenId) external view returns (uint poolId, address owner);

  function stakingPoolOf(uint tokenId) external view returns (uint poolId);

  function stakingPoolFactory() external view returns (address);

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
  error NotStakingPool();

}
