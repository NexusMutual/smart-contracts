pragma solidity ^0.4.11;



 /// @title SafeMath
 /// @dev Math operations with safety checks that throw on error
library SafeMaths {
  function mul(uint256 a, uint256 b) internal constant returns (uint256) {
    uint256 c = a * b;
    assert(a == 0 || c / a == b);
    return c;
  }

  function div(uint256 a, uint256 b) internal constant returns (uint256) {
    // assert(b > 0); // Solidity automatically throws when dividing by 0
    uint256 c = a / b;
    // assert(a == b * c + a % b); // There is no case in which this doesn't hold
    return c;
  }

  function sub(uint256 a, uint256 b) internal constant returns (uint256) {
    assert(b <= a);
    return a - b;
  }

  function add(uint256 a, uint256 b) internal constant returns (uint256) {
    uint256 c = a + b;
    assert(c >= a);
    return c;
  }
  function mul64(uint64 a, uint64 b) internal constant returns (uint64) {
    uint64 c = a * b;
    assert(a == 0 || c / a == b);
    return c;
  }
  function sub64(uint64 a, uint64 b) internal constant returns (uint64) {
    assert(b <= a);
    return a - b;
  }
  function add64(uint64 a, uint64 b) internal constant returns (uint64) {
    uint64 c = a + b;
    assert(c >= a);
    return c;
  }
  function mul32(uint32 a, uint32 b) internal constant returns (uint32) {
    uint32 c = a * b;
    assert(a == 0 || c / a == b);
    return c;
  }
  function sub32(uint32 a, uint32 b) internal constant returns (uint32) {
    assert(b <= a);
    return a - b;
  }
  function div32(uint32 a, uint32 b) internal constant returns (uint32) {
    // assert(b > 0); // Solidity automatically throws when dividing by 0
    uint32 c = a / b;
    // assert(a == b * c + a % b); // There is no case in which this doesn't hold
    return c;
  }
  function add32(uint32 a, uint32 b) internal constant returns (uint32) {
    uint32 c = a + b;
    assert(c >= a);
    return c;
  }
  function mul16(uint16 a, uint16 b) internal constant returns (uint16) {
    uint16 c = a * b;
    assert(a == 0 || c / a == b);
    return c;
  }
  function sub16(uint16 a, uint16 b) internal constant returns (uint16) {
    assert(b <= a);
    return a - b;
  }
  function div16(uint16 a, uint16 b) internal constant returns (uint16) {
    // assert(b > 0); // Solidity automatically throws when dividing by 0
    uint16 c = a / b;
    // assert(a == b * c + a % b); // There is no case in which this doesn't hold
    return c;
  }
  function sub8(uint8 a, uint8 b) internal constant returns (uint8) {
    assert(b <= a);
    return a - b;
  }
  function add8(uint8 a, uint8 b) internal constant returns (uint8) {
    uint8 c = a + b;
    assert(c >= a);
    return c;
  }
  
}