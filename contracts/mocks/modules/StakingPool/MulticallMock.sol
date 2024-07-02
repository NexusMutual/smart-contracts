// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../../abstract/Multicall.sol";

contract MulticallMock is Multicall {

  error EmptyCustomError();
  error UintCustomError(uint errCode);

  uint zero = 0;

  function panicError() public view {
   // use storage to trick compiler into thinking this makes sense
   uint(100) / zero;
  }

  function emptyRevert() public pure {
    revert();
  }

  function emptyRequire() public pure {
    require(false);
  }

  function emptyCustomError() public pure {
    revert EmptyCustomError();
  }

  function uintCustomError(uint errCode) public pure {
    revert UintCustomError(errCode);
  }

  function stringRevert32() public pure {
    require(false, "String revert");
  }

  function stringRevert64() public pure {
    require(false, "012345678901234567890123456789012345678901234567890123456789001234567890");
  }

  function stringRevertParam(string calldata reason) public pure {
    require(false, reason);
  }

  function returndataSizeTest(string calldata reason) public view {

    bytes memory data = abi.encodeWithSignature("stringRevertParam(string)", reason);

    // perform a direct call
    (bool directCallSuccess, bytes memory directCallReason) = address(this).staticcall(data);
    require(!directCallSuccess, "Expected direct call to revert");

    bytes[] memory multicallParams = new bytes[](1);
    multicallParams[0] = data;
    bytes memory multicallData = abi.encodeWithSignature("multicall(bytes[])", multicallParams);

    // perform the same call via multicall
    (bool multicallSuccess, bytes memory multicallReason) = address(this).staticcall(multicallData);
    require(!multicallSuccess, "Expected multicall to revert");

    require(directCallReason.length == multicallReason.length, "Expected identical reason length");
  }

  function success() public pure returns (bool) {
    return true;
  }
}
