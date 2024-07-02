// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../modules/legacy/LegacyClaimProofs.sol";

contract TestnetClaimProofs is LegacyClaimProofs {

  function addMockProof(uint _coverId, address member, string calldata _ipfsHash) external {
    emit ProofAdded(_coverId, member, _ipfsHash);
  }

}
