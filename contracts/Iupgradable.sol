pragma solidity 0.4.24;


contract Iupgradable {
    function changeMasterAddress(address _add) public;

    function  changeDependentContractAddress() public;
}
