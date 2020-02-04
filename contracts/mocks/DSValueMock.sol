pragma solidity 0.5.7;
import "../external/openzeppelin-solidity/math/SafeMath.sol";


contract DSValueMock {

    using SafeMath for uint;
    int public p;
    address public owner;
    bool zeroRate;
    constructor(address _owner) public {
        p = int(uint(10**18).div(120));
        owner = _owner;
    }

    function read() public view returns (bytes32) {
        if(zeroRate)
            return bytes32(0);
        return bytes32(uint(10**36).div(uint(p)));
        
    }

    function setZeroRate(bool _zeroRate) public {
        require(msg.sender == owner);
        zeroRate = _zeroRate;
    }

    function setRate(uint value) public {
        require(msg.sender == owner);
        p = int(uint(10**18).div(value));
    }
}
