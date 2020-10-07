pragma solidity ^0.5.0;

import "../modules/capital/Pool1.sol";
import "../modules/claims/ClaimsData.sol";

contract Pool1Mock is Pool1 {

  function _oraclizeQuery(
    uint paramCount,
    uint timestamp,
    string memory datasource,
    string memory arg,
    uint gasLimit
  )
  internal
  returns (bytes32)
  {
    return bytes32(
      keccak256(abi.encodePacked(paramCount, timestamp, datasource, arg, gasLimit, now))
    );
  }
}
