// SPDX-License-Identifier: GPL-3.0-or-later
import "@openzeppelin/contracts-v4/utils/Strings.sol";

pragma solidity ^0.8.0;

contract FloatingPoint {
  using Strings for uint;

  // Convert a number to a float string with 2 decimals
  function toFloat(
    uint number,
    uint decimals
  ) public pure returns (string memory float) {
    if (decimals == 0) {
      return number.toString();
    }

    uint decimalBase = 10 ** decimals;

    // Get the integer part
    uint integerVal = number / (decimalBase);
    float = string(abi.encodePacked(integerVal.toString(), "."));

    // Get the remainder
    uint remainder = number % (decimalBase);
    string memory remainderStr = remainder.toString();

    // Pad the remainder with 0 if single digit
    if (remainder < 10) {
      remainderStr = string(abi.encodePacked("0", remainderStr));
    }

    // Only take the first two bytes of the remainder
    if (remainder > 99) {
      bytes memory remainderBytes = bytes(remainderStr);
      remainderStr = string(abi.encodePacked(remainderBytes[0], remainderBytes[1]));
    }

    float = string(abi.encodePacked(float, remainderStr));
  }
}