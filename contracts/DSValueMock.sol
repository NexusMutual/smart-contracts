pragma solidity 0.5.7;


contract DSValueMock {

    bytes32 public p;

    constructor() public {
        p = bytes32("0x68155A43676E00000");
    }

    function read() public view returns (bytes32) {
        return p;
        
    }

    function setRate(uint value) public {
        p = bytes32(value);
    }

    function peek() public pure returns (bytes32, bool) {
        return (0x000000000000000000000000000000000000000000000008696a94dfc55d0000, true);
    }
}