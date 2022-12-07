// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721.sol";

interface IStakingNFT is IERC721 {

  function isApprovedOrOwner(address spender, uint tokenId) external returns (bool);

  function mint(address to, uint tokenId) external;

  function mint(address to) external returns (uint tokenId);

  function burn(uint tokenId) external;

  function operatorTransferFrom(address from, address to, uint256 tokenId) external;
}
