pragma solidity ^0.4.23;


contract DSValue {

    function peek() public view returns (bytes32, bool) {
        return (0x000000000000000000000000000000000000000000000005c9598a3439224000, true);
    }

    function read() public view returns (bytes32) {
        return 0x000000000000000000000000000000000000000000000005c9598a3439224000;
    }
}