pragma solidity 0.5.7;

import "../TokenData.sol";


contract TokenDataMock is TokenData {

    constructor(address payable _walletAdd) public TokenData(_walletAdd) {
        walletAddress = _walletAdd;
        bookTime = 60;
        joiningFee = 2000000000000000; // 0.002 Ether
        lockTokenTimeAfterCoverExp = 35 days;
        scValidDays = 250;
        lockCADays = 7 days;
        lockMVDays = 2 days;
        stakerCommissionPer = 20;
        stakerMaxCommissionPer = 50;
        tokenExponent = 4;
        priceStep = 1000;

    }
    
}
