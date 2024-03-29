// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "@openzeppelin/contracts-v4/token/ERC721/IERC721.sol";

interface IERC721Mock is IERC721 {

  function mint(address to) external;

  function isApprovedOrOwner(address spender, uint tokenId) external returns (bool);
}
