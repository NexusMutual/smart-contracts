// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

abstract contract Multicall {

  error RevertedWithoutReason(uint index);

  // WARNING: Do not set this function as payable
  function multicall(bytes[] calldata data) external returns (bytes[] memory results) {

    uint callCount = data.length;
    results = new bytes[](callCount);

    for (uint i = 0; i < callCount; i++) {
      (bool ok, bytes memory result) = address(this).delegatecall(data[i]);

      if (!ok) {

        uint length = result.length;

        // 0 length returned from empty revert() / require(false)
        if (length == 0) {
          revert RevertedWithoutReason(i);
        }

        assembly {
          revert(add(result, 0x20), length)
        }
      }

      results[i] = result;
    }
  }
}
