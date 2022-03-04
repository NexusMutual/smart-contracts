// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import '@openzeppelin/contracts-v4/token/ERC721/IERC721.sol';

interface IERC721Mock is IERC721 {
  function safeMint(address to, uint256 tokenId) external;

  function isApprovedOrOwner(address spender, uint256 tokenId) external returns (bool);
}
