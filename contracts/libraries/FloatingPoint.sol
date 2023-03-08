// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-v4/utils/Strings.sol";

library FloatingPoint {
  using Strings for uint;

  // Convert a number to a float string with 2 decimals
  function toFloat(
    uint number,
    uint decimals
  ) internal pure returns (string memory float) {
    if (decimals == 0) {
      return string(abi.encodePacked(number.toString(), ".00"));
    }

    uint decimalBase = 10 ** decimals;

    // Get the integer part
    uint integerVal = number / (decimalBase);
    float = string(abi.encodePacked(integerVal.toString(), "."));

    // Get the remainder
    uint remainder = number % (decimalBase);
    string memory remainderStr = remainder.toString();
    bytes memory remainderBytes = bytes(remainderStr);

    // The number of digits should be greater than decimals - 1
    if (remainderBytes.length + 1 < decimals) {
      return string(abi.encodePacked(float, "00"));
    }

    // If the remainder is less than 10, add a leading zero before digit and return
    if (remainder < decimalBase / 10) {
      remainderStr = string(abi.encodePacked("0", remainderBytes[0]));
      return string(abi.encodePacked(float, remainderStr));
    }

    // If the remainder is a single digit, add a trailing zero and return
    if (remainderBytes.length == 1) {
      remainderStr = string(abi.encodePacked(remainderBytes[0], "0"));
      return string(abi.encodePacked(float, remainderStr));
    }

    // Otherwise encode first two digits of remainder
    remainderStr = string(
      abi.encodePacked(remainderBytes[0], remainderBytes[1])
    );
    float = string(abi.encodePacked(float, remainderStr));
  }
}
