// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721.sol";

interface IStakingNFT is IERC721 {

  function isApprovedOrOwner(address spender, uint tokenId) external returns (bool);

  function mint(uint poolId, address to) external returns (uint tokenId);

  function operatorTransferFrom(address from, address to, uint256 tokenId) external;

  function changeOperator(address newOperator) external;

  function totalSupply() external returns (uint);
}
