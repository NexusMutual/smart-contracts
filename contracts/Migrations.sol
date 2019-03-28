pragma solidity 0.4.24;


contract Migrations {
    address public owner;
    uint public last_completed_migration; // solhint-disable-line var-name-mixedcase

    constructor() public {
        owner = msg.sender;
    }

    modifier restricted() {
        if (msg.sender == owner) {
            _;
        }
    }

    /**
     * @dev to keep a record of migration being completed 
     * @param completed to represent completed migration
     */
    function setCompleted(uint completed) public restricted {
        last_completed_migration = completed;
    }

    /**
     * @dev to upgrade the migrations
     * @param newAddress represents the updated migrations address
     */
    function upgrade(address newAddress) public restricted {
        Migrations upgraded = Migrations(newAddress);
        upgraded.setCompleted(last_completed_migration);
    }
}