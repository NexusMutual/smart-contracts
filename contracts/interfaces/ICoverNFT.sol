// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721.sol";

interface ICoverNFT is IERC721 {

  function safeMint(address to, uint tokenId) external;

  function isApprovedOrOwner(address spender, uint tokenId) external returns (bool);

  function burn(uint tokenId) external;

  function operatorTransferFrom(address from, address to, uint256 tokenId) external;
}
