// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-v4/utils/cryptography/ECDSA.sol";

abstract contract EIP712 {

  bytes32 public immutable DOMAIN_SEPARATOR;

  constructor(
    string memory name,
    string memory version,
    address verifyingContract
  ) {
    bytes32 hashedName = keccak256(bytes(name));
    bytes32 hashedVersion = keccak256(bytes(version));
    bytes32 typeHash = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    DOMAIN_SEPARATOR = keccak256(abi.encode(typeHash, hashedName, hashedVersion, block.chainid, verifyingContract));
  }

  function recoverSigner(
    bytes memory message,
    bytes memory signature
  ) public view virtual returns (address signer) {
    bytes32 digest = ECDSA.toTypedDataHash(DOMAIN_SEPARATOR, keccak256(message));
    return ECDSA.recover(digest, signature);
  }
}
