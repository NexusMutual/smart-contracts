// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.16;

contract LegacyClaimProofs {

  event ProofAdded(uint indexed coverId, address indexed owner, string ipfsHash);

  function addProof(uint _coverId, string calldata _ipfsHash) external {
    emit ProofAdded(_coverId, msg.sender, _ipfsHash);
  }

}
