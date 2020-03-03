pragma solidity 0.5.7;

import "./Pool1Mock.sol";
import "../ClaimsData.sol";
import "../TokenFunctions.sol";


contract TokenFunctionNewMock is TokenFunctions {

    uint private constant pointMultiplier = 10;

    constructor(address payable sdAdd) public TokenFunctions(sdAdd) {


    }
event testing1(uint individual,uint totalBurn,uint alloc,uint global);
    /**
        * @dev Burns tokens staked against a Smart Contract Cover.
        * Called when a claim submitted against this cover is accepted.
    */
    function burnStakerStake(uint _claimId, address scAddress, uint burnNXM) external {
        uint burnNXMAmount = burnNXM;
        // uint tokenPrice = m1.calculateTokenPrice(curr);
        // uint burnNXMAmount = qd.getCoverSumAssured(_coverId).mul(DECIMAL1E18).div(tokenPrice);
        uint totalStakedOncontract = getTotalStakedTokensOnSmartContract(scAddress).mul(pointMultiplier);
        if(burnNXMAmount > totalStakedOncontract)
            burnNXMAmount = totalStakedOncontract;
        sd.pushClaimIdBurnedStake(_claimId, burnNXMAmount.mul(10000).div(totalStakedOncontract));
        uint totalStaker = sd.getTotalStakerAgainstSC(scAddress);
        for (uint i = 0; i < totalStaker; i++) {
            address stakerAdd;
            uint allocation;
            (stakerAdd, allocation) = sd.stakedContractStakers(scAddress, i);
            uint stakerBurn = allocation.mul(sd.getActualGlobalStake(stakerAdd)).mul(pointMultiplier).div(10000);
            emit testing1(stakerBurn,burnNXMAmount,allocation,sd.getActualGlobalStake(stakerAdd));
            if(burnNXMAmount < totalStakedOncontract)
                stakerBurn = stakerBurn.mul(burnNXMAmount).div(totalStakedOncontract);
            tc.increaseGlobalBurn(stakerAdd, stakerBurn);

        }
        tc.burnRaLock(burnNXMAmount);
    }
}
