pragma solidity ^0.4.24;


contract DSValueMock {

    function peek() public pure returns (bytes32, bool) {
        return (0x000000000000000000000000000000000000000000000008696a94dfc55d0000, true);
    }

    function read() public pure returns (bytes32) {
        return 0x000000000000000000000000000000000000000000000008696a94dfc55d0000;
    }
}