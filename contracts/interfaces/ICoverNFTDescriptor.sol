// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface ICoverNFTDescriptor {

  function tokenURI(uint tokenId) external view returns (string memory);

}
