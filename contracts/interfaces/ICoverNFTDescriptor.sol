// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

  struct CoverTokenURIParams {
    uint tokenId;
    string name;
  }

  error InvalidNewNFTDescriptorAddress();

interface ICoverNFTDescriptor {

  function tokenURI(CoverTokenURIParams calldata params) external view returns (string memory);

}
