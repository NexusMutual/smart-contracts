pragma solidity 0.4.24;

import "../Pool1.sol";

contract TokenFunctionMock is TokenFunctions {

	 /**
     * @dev Burns tokens staked against a Smart Contract Cover.
     * Called when a claim submitted against this cover is accepted.
     */
    function burnStakerLockedToken(address scAddress, uint burnNXMAmount) external onlyInternal {
        uint totalStaker = td.getStakedContractStakersLength(scAddress);
        address stakerAddress;
        uint stakerStakedNXM;
        uint toBurn = burnNXMAmount;
        for (uint i = td.stakedContractCurrentBurnIndex(scAddress); i < totalStaker; i++) {
            if (toBurn > 0) {
                stakerAddress = td.getStakedContractStakerByIndex(scAddress, i);
            //     stakerStakedNXM = _getStakerLockedTokensOnSmartContract(
            // stakerAddress, scAddress, i).sub(_getStakerUnlockableTokensOnSmartContract(
            //         stakerAddress, scAddress, i));
          stakerStakedNXM =  _getStakerStakedTokensOnSmartContract(stakerAddress, scAddress, i);
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
    
}
