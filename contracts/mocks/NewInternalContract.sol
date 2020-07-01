pragma solidity ^0.5.17;

import "../interfaces/IUpgradeable.sol";

contract NewInternalContract is Iupgradable {

  event ChangeContractAddressCustomEvent (

  );

  function callUpdatePauseTime(uint _val) public {
    ms.updatePauseTime(_val);
  }

  function changeDependentContractAddress() public onlyInternal {
    emit ChangeContractAddressCustomEvent();
  }
}
