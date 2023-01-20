// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

contract MultiCallable {
  error RevertedWithoutReason(uint index);

  // WARNING: Do not set this function as payable
  function multicall(bytes[] calldata data) external returns (bytes[] memory results) {

    uint callCount = data.length;
    results = new bytes[](callCount);

    for (uint i = 0; i < callCount; i++) {
      (bool ok, bytes memory result) = address(this).delegatecall(data[i]);

      uint length = result.length;

      if (!ok) {

        // 0 length returned from empty revert() / require(false)
        if (length == 0) {
          revert RevertedWithoutReason(i);
        }

        assembly {
          result := add(result, 0x20)
          revert(result, add(result, length))
        }
      }

      results[i] = result;
    }
  }
}