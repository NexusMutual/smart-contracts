pragma solidity 0.4.24;

import "../Pool1.sol";

contract Pool1Mock is Pool1 {

	function oraclizeQuery(
        uint paramCount,
        uint timestamp,
        string datasource,
        string arg,
        uint gasLimit
    ) 
        internal
        returns (bytes32)
    {
        // To silence compiler warning :(
        paramCount;
        timestamp;
        datasource;
        arg;
        gasLimit;
    }
}
