// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

contract TemporaryGovernance {

  error RevertedWithoutReason();
  error OnlyAdvisoryBoardMultisig();

  address public immutable advisoryBoardMultisig;

  constructor(address _advisoryBoardMultisig) {
    advisoryBoardMultisig = _advisoryBoardMultisig;
  }

  function execute(address target, uint value, bytes memory data) external {

    require(msg.sender == advisoryBoardMultisig, OnlyAdvisoryBoardMultisig());

    (bool ok, bytes memory returndata) = target.call{value: value}(data);

    if (ok) {
      return;
    }

    uint size = returndata.length;

    if (size == 0) {
      revert RevertedWithoutReason();
    }

    // bubble up the revert reason
    assembly {
      revert(add(returndata, 0x20), size)
    }
  }

  function changeDependentContractAddress() public pure { }

  function changeMasterAddress(address) public pure { }

}
