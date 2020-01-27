pragma solidity 0.5.7;


contract DSValueMock {

    uint public p;

    constructor() public {
        p = 120 * 10**8;
    }

    function read() public view returns (bytes32) {
        return bytes32(p * 10**10);
        
    }

    function setRate(uint value) public {
        p = value;
    }
}