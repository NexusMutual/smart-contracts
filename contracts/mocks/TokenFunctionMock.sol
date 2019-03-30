pragma solidity 0.4.24;

import "../Pool1.sol";
import "../ClaimsData.sol";


contract TokenFunctionMock is TokenFunctions {

    /**
        * @dev Burns tokens staked against a Smart Contract Cover.
        * Called when a claim submitted against this cover is accepted.
    */
    function burnStakerLockedToken(address scAddress, uint burnNXMAmount) external {
        uint totalStaker = td.getStakedContractStakersLength(scAddress);
        address stakerAddress;
        uint stakerStakedNXM;
        uint toBurn = burnNXMAmount;
        for (uint i = td.stakedContractCurrentBurnIndex(scAddress); i < totalStaker; i++) {
            if (toBurn > 0) {
                stakerAddress = td.getStakedContractStakerByIndex(scAddress, i);
                uint stakerIndex = td.getStakedContractStakerIndex(
                scAddress, i);
                uint v;
                (v, stakerStakedNXM) = _unlockableBeforeBurningAndCanBurn(stakerAddress, scAddress, stakerIndex);
                td.pushUnlockableBeforeLastBurnTokens(stakerAddress, stakerIndex, v);
                // stakerStakedNXM =  _getStakerStakedTokensOnSmartContract(stakerAddress, scAddress, i);
                if (stakerStakedNXM > 0) {
                    if (stakerStakedNXM >= toBurn) {
                        _burnStakerTokenLockedAgainstSmartContract(
                            stakerAddress, scAddress, i, toBurn);
                        if (i > 0)
                            td.setStakedContractCurrentBurnIndex(scAddress, i);
                        toBurn = 0;
                        break;
                    } else {
                        _burnStakerTokenLockedAgainstSmartContract(
                            stakerAddress, scAddress, i, stakerStakedNXM);
                        toBurn = toBurn.sub(stakerStakedNXM);
                    }
                }
            } else
                break;
        }
        if (toBurn > 0 && totalStaker > 0)
            td.setStakedContractCurrentBurnIndex(scAddress, totalStaker.sub(1));
    }

    function mint(address _member, uint _amount) external {
        tc.mint(_member, _amount);
    }

    function burnFrom(address _of, uint amount) external {
        tc.burnFrom(_of, amount);
    }

    function reduceLock(address _of, bytes32 _reason, uint256 _time) external {
        tc.reduceLock(_of, _reason, _time);
    }

    function burnLockedTokens(address _of, bytes32 _reason, uint256 _amount) external {
        tc.burnLockedTokens(_of, _reason, _amount);
    }

    function releaseLockedTokens(address _of, bytes32 _reason, uint256 _amount) 
        external 
     
    {
        tc.releaseLockedTokens(_of, _reason, _amount);
    }    

    function upgradeCapitalPool(address newPoolAddress) external {
        Pool1 p1 = Pool1(ms.getLatestAddress("P1"));
        p1.upgradeCapitalPool(newPoolAddress);
    }

    function setClaimSubmittedAtEPTrue(uint _index, bool _submit) external {
        ClaimsData cd = ClaimsData(ms.getLatestAddress("CD"));
        cd.setClaimSubmittedAtEPTrue(_index, _submit);
    }

    function transferCurrencyAsset(
        bytes4 curr,
        address transferTo,
        uint amount
    )
        public
        returns(bool)
    {
        Pool1 p1 = Pool1(ms.getLatestAddress("P1"));
    
        return p1.transferCurrencyAsset(curr, transferTo, amount);
    }
}
