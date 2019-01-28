pragma solidity 0.4.24;
import "./imports/uniswap/solidity-interface.sol";

contract DSValue1 {
    Factory internal factory;
    function () public payable {} 
    // function peek() public view returns (bytes32, bool);
    function read() public view returns (bytes32){
    	Exchange exchange;
    	exchange = Exchange(0x8779C708e2C3b1067de9Cd63698E4334866c691C);
    	uint rate = exchange.getEthToTokenInputPrice(1);
    	rate = rate * (10 ** 18);
    	return (bytes32(rate));
    }
}