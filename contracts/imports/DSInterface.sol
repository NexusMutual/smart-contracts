pragma solidity ^0.4.23;

contract DSInterface {
    
    function peek() public view returns (bytes32, bool);
    
    function read() public view returns (bytes32);
}