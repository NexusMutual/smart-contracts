pragma solidity ^0.5.0;

import "./ERC20Mock.sol";

contract ERC20DetailedMock is ERC20Mock {

    function decimals() external view returns (uint8) {
        return 18;
    }
}


