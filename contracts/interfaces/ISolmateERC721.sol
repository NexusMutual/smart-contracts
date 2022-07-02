// SPDX-License-Identifier: GPL-3.0-only
pragma solidity >=0.8.0;

interface ISolmateERC721 {

  function tokenURI(uint256 id) external view returns (string memory);

  function ownerOf(uint256 id) external view returns (address owner);

  function balanceOf(address owner) external view returns (uint256);

  function approve(address spender, uint256 id) external;

  function setApprovalForAll(address operator, bool approved) external;

  function transferFrom(address from, address to, uint256 id) external;

  function safeTransferFrom(address from, address to, uint256 id) external;

  function safeTransferFrom(address from, address to, uint256 id, bytes calldata data) external;

  function supportsInterface(bytes4 interfaceId) external view returns (bool);
}
