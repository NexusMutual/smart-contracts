// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.0;

import "../utils/MultiCallable.sol";

contract MulticallMock is MultiCallable {

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

  function success() public pure returns (bool) {
    return true;
  }
}
