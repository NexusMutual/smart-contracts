pragma solidity 0.5.7;

contract Aggregator {
    function currentAnswer() public view returns (uint); 
}

contract DSValue {
    
    function read() public view returns (bytes32)
    {
        
        // Instance to get DAI feed from chainlink feed.
        Aggregator aggregator = Aggregator(0x79fEbF6B9F76853EDBcBc913e6aAE8232cFB9De9);
        
        // Chainlink feed is returning value in rate * 10^8 format and we need in rate * 10^18 format
        // Hence, multiplying with 10^10.
        // Chainlink feed is returning value in uint but we are expecting it in bytes32.
        return bytes32(aggregator.currentAnswer()*10**10);
    }
}