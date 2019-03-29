pragma solidity 0.4.24;

import "../QuotationData.sol";
import "../PoolData.sol";
import "../imports/proxy/OwnedUpgradeabilityProxy.sol";


contract QuotationDataMock is QuotationData {

    PoolData public pd;

    constructor (address _authQuoteAdd, address _kycAuthAdd) public QuotationData(_authQuoteAdd, _kycAuthAdd) {

    }

    function changeHoldedCoverDetails (uint index, uint[] newcoverDetails) public {
        allCoverHolded[index].coverDetails = newcoverDetails;
    }

    function changeHoldedCoverPeriod (uint index, uint16 newCoverPeriod) public {
        allCoverHolded[index].coverPeriod = newCoverPeriod;
    }

    function changeHoldedCoverCurrency (uint index, bytes4 newCurr) public {
        allCoverHolded[index].coverCurr = newCurr;
    }

    function changeCurrencyAssetAddress(bytes4 curr, address currAdd) public {
        pd = PoolData(ms.getLatestAddress("PD"));
        pd.changeCurrencyAssetAddress(curr, currAdd);
    }

    function changeInvestmentAssetAddress(bytes4 curr, address currAdd) public {
        pd = PoolData(ms.getLatestAddress("PD"));
        pd.changeInvestmentAssetAddressAndDecimal(curr, currAdd, 18);
    }

    function getImplementationAdd(bytes2 _contract) public view returns(address) {

        UpgradeabilityProxy up = UpgradeabilityProxy(ms.getLatestAddress(_contract));
        return up.implementation();
    }
}