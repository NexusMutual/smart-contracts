pragma solidity 0.5.7;
import "../external/openzeppelin-solidity/math/SafeMath.sol";


contract NXMDSValueMock {

    using SafeMath for uint;
    int public rate;
    address public owner;
    bool internal zeroRate;

    constructor(address _owner) public {
        rate = int(uint(10**18).div(120));
        owner = _owner;
    }

    function read() public view returns (bytes32) {
        if (zeroRate) {
            return bytes32(0);
        }
        return bytes32(uint(10**36).div(uint(rate)));
        
    }

    function setZeroRate(bool _zeroRate) public {
        require(msg.sender == owner);
        zeroRate = _zeroRate;
    }

    function setRate(uint value) public {
        require(msg.sender == owner);
        rate = int(uint(10**18).div(value));
    }
}
