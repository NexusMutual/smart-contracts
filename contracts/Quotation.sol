/* Copyright (C) 2017 NexusMutual.io

  This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

  This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
    along with this program.  If not, see http://www.gnu.org/licenses/ */

pragma solidity 0.4.24;

import "./QuotationData.sol";
import "./TokenFunctions.sol";
import "./TokenController.sol";
import "./TokenData.sol";
import "./PoolData.sol";
import "./MCR.sol";
import "./MemberRoles.sol";
import "./Pool1.sol";


contract Quotation is Iupgradable {
    using SafeMath for uint;

    TokenFunctions internal tf;
    TokenController internal tc;
    TokenData internal td;
    Pool1 internal p1;
    PoolData internal pd;
    QuotationData internal qd;
    MCR internal m1;
    MemberRoles internal mr;
    bool internal locked;

    event RefundEvent(address indexed user, bool indexed status, uint holdedCoverID, bytes32 reason);

    modifier noReentrancy() {
        require(!locked, "Reentrant call.");
        locked = true;
        _;
        locked = false;
    }

    function () public payable {} //solhint-disable-line

    /**
     * @dev Iupgradable Interface to update dependent contract address
     */
    function changeDependentContractAddress() public onlyInternal {
        m1 = MCR(ms.getLatestAddress("MC"));
        tf = TokenFunctions(ms.getLatestAddress("TF"));
        tc = TokenController(ms.getLatestAddress("TC"));
        td = TokenData(ms.getLatestAddress("TD"));
        qd = QuotationData(ms.getLatestAddress("QD"));
        p1 = Pool1(ms.getLatestAddress("P1"));
        pd = PoolData(ms.getLatestAddress("PD"));
        mr = MemberRoles(ms.getLatestAddress("MR"));
    }

    /**
     * @dev Expires a cover after a set period of time.
     * Changes the status of the Cover and reduces the current
     * sum assured of all areas in which the quotation lies
     * Unlocks the CN tokens of the cover. Updates the Total Sum Assured value.
     * @param _cid Cover Id.
     */ 
    function expireCover(uint _cid) public {
        require(checkCoverExpired(_cid) && qd.getCoverStatusNo(_cid) != uint(QuotationData.CoverStatus.CoverExpired));
        
        tf.unlockCN(_cid);
        bytes4 curr;
        address scAddress;
        uint sumAssured;
        (, , scAddress, curr, sumAssured, ) = qd.getCoverDetailsByCoverID1(_cid);
        if (qd.getCoverStatusNo(_cid) != uint(QuotationData.CoverStatus.ClaimAccepted))
            _removeSAFromCSA(_cid, sumAssured);
        qd.changeCoverStatusNo(_cid, uint8(QuotationData.CoverStatus.CoverExpired));       
    }

    /**
     * @dev Checks if a cover should get expired/closed or not.
     * @param _cid Cover Index.
     * @return expire true if the Cover's time has expired, false otherwise.
     */ 
    function checkCoverExpired(uint _cid) public view returns(bool expire) {

        expire = qd.getValidityOfCover(_cid) < uint64(now);

    }

    /**
     * @dev Updates the Sum Assured Amount of all the quotation.
     * @param _cid Cover id
     * @param _amount that will get subtracted Current Sum Assured 
     * amount that comes under a quotation.
     */ 
    function removeSAFromCSA(uint _cid, uint _amount) public onlyInternal {
        _removeSAFromCSA(_cid, _amount);        
    }

    /**
     * @dev Makes Cover funded via NXM tokens.
     * @param smartCAdd Smart Contract Address
     */ 
    function makeCoverUsingNXMTokens(
        uint[] coverDetails,
        uint16 coverPeriod,
        bytes4 coverCurr,
        address smartCAdd,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        public
        isMemberAndcheckPause
    {
        
        tc.burnFrom(msg.sender, coverDetails[2]); //need burn allowance
        _verifyCoverDetails(msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
    }

    /**
     * @dev Verifies cover details signed off chain.
     * @param from address of funder.
     * @param scAddress Smart Contract Address
     */
    function verifyCoverDetails(
        address from,
        address scAddress,
        bytes4 coverCurr,
        uint[] coverDetails,
        uint16 coverPeriod,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        public
        onlyInternal
    {
        _verifyCoverDetails(
            from,
            scAddress,
            coverCurr,
            coverDetails,
            coverPeriod,
            _v,
            _r,
            _s
        );
    }

    /** 
     * @dev Verifies signature.
     * @param coverDetails details related to cover.
     * @param coverPeriod validity of cover.
     * @param smaratCA smarat contract address.
     * @param _v argument from vrs hash.
     * @param _r argument from vrs hash.
     * @param _s argument from vrs hash.
     */ 
    function verifySign(
        uint[] coverDetails,
        uint16 coverPeriod,
        bytes4 curr,
        address smaratCA,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) 
        public
        view
        returns(bool)
    {
        require(smaratCA != address(0));
        require(pd.capReached() == 1, "Can not buy cover until cap reached for 1st time");
        bytes32 hash = getOrderHash(coverDetails, coverPeriod, curr, smaratCA);
        return isValidSignature(hash, _v, _r, _s);
    }

    /**
     * @dev Gets order hash for given cover details.
     * @param coverDetails details realted to cover.
     * @param coverPeriod validity of cover.
     * @param smaratCA smarat contract address.
     */ 
    function getOrderHash(
        uint[] coverDetails,
        uint16 coverPeriod,
        bytes4 curr,
        address smaratCA
    ) 
        public
        pure
        returns(bytes32)
    {
        return keccak256(
            abi.encodePacked(
                coverDetails[0],
                curr, coverPeriod,
                smaratCA,
                coverDetails[1],
                coverDetails[2],
                coverDetails[3]
            )
        );
    }

    /**
     * @dev Verifies signature.
     * @param hash order hash
     * @param v argument from vrs hash.
     * @param r argument from vrs hash.
     * @param s argument from vrs hash.
     */  
    function isValidSignature(bytes32 hash, uint8 v, bytes32 r, bytes32 s) public view returns(bool) {
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixedHash = keccak256(abi.encodePacked(prefix, hash));
        address a = ecrecover(prefixedHash, v, r, s);
        return (a == qd.getAuthQuoteEngine());
    }

    /**
     * @dev to get the status of recently holded coverID 
     * @param userAdd is the user address in concern
     * @return the status of the concerned coverId
     */
    function getRecentHoldedCoverIdStatus(address userAdd) public view returns(int) {

        uint holdedCoverLen = qd.getUserHoldedCoverLength(userAdd);
        if (holdedCoverLen == 0) {
            return -1;
        } else {
            uint holdedCoverID = qd.getUserHoldedCoverByIndex(userAdd, holdedCoverLen - 1);
            return int(qd.holdedCoverIDStatus(holdedCoverID));
        }
    }
    
    /**
     * @dev to initiate the membership and the cover 
     * @param smartCAdd is the smart contract address to make cover on
     * @param coverCurr is the currency used to make cover
     * @param coverDetails list of details related to cover like cover amount, expire time, coverCurrPrice and priceNXM
     * @param coverPeriod is cover period for which cover is being bought
     * @param _v argument from vrs hash 
     * @param _r argument from vrs hash 
     * @param _s argument from vrs hash 
     */
    function initiateMembershipAndCover(
        address smartCAdd,
        bytes4 coverCurr,
        uint[] coverDetails,
        uint16 coverPeriod,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    ) 
        public
        payable
        checkPause
    {
        require(coverDetails[3] > now);
        require(!ms.isMember(msg.sender));
        require(qd.refundEligible(msg.sender) == false);
        uint joinFee = td.joiningFee();
        uint totalFee = joinFee;
        if (coverCurr == "ETH") {
            totalFee = joinFee + coverDetails[1];
        } else {
            IERC20 erc20 = IERC20(pd.getCurrencyAssetAddress(coverCurr));
            require(erc20.transferFrom(msg.sender, address(this), coverDetails[1]));
        }
        require(msg.value == totalFee);
        require(verifySign(coverDetails, coverPeriod, coverCurr, smartCAdd, _v, _r, _s));
        qd.addHoldCover(msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod);
        qd.setRefundEligible(msg.sender, true);
    }

    /**
     * @dev to get the full refund 
     */
    function fullRefund() public checkPause noReentrancy {
        _kycTrigger(false, msg.sender);
    }

    /**
     * @dev to get the verdict of kyc process 
     * @param status is the kyc status
     * @param _add is the address of member
     */
    function kycVerdict(bool status, address _add) public checkPause noReentrancy {
        require(msg.sender == qd.kycAuthAddress());
        _kycTrigger(status, _add);
    }

    /**
     * @dev transfering Ethers to newly created quotation contract.
     */  
    function transferAssetsToNewContract(address newAdd) public onlyInternal noReentrancy {
        uint amount = address(this).balance;
        IERC20 erc20;
        if (amount > 0) {
            newAdd.transfer(amount);   
        }
        uint currAssetLen = pd.getAllCurrenciesLen();
        for (uint64 i = 1; i < currAssetLen; i++) {
            bytes4 currName = pd.getCurrenciesByIndex(i);
            address currAddr = pd.getCurrencyAssetAddress(currName);
            erc20 = IERC20(currAddr); //solhint-disable-line
            if (erc20.balanceOf(this) > 0) {
                erc20.transfer(newAdd, erc20.balanceOf(this));
            }
        }
    }


    /**
     * @dev Creates cover of the quotation, changes the status of the quotation ,
     * updates the total sum assured and locks the tokens of the cover against a quote.
     * @param from Quote member Ethereum address.
     */  

    function _makeCover ( //solhint-disable-line
        address from,
        address scAddress,
        bytes4 coverCurr,
        uint[] coverDetails,
        uint16 coverPeriod
    )
        internal
    {
        uint cid = qd.getCoverLength();
        qd.addCover(coverPeriod, coverDetails[0],
            from, coverCurr, scAddress, coverDetails[1], coverDetails[2]);
        // if cover period of quote is less than 60 days.
        if (coverPeriod <= 60) {
            p1.closeCoverOraclise(cid, uint64(coverPeriod * 1 days));
        }
        uint coverNoteAmount = (coverDetails[2].mul(qd.tokensRetained())).div(100);
        tc.mint(from, coverNoteAmount);
        tf.lockCN(coverNoteAmount, coverPeriod, cid, from);
        qd.addInTotalSumAssured(coverCurr, coverDetails[0]);
        qd.addInTotalSumAssuredSC(scAddress, coverCurr, coverDetails[0]);
        if (tf.getTotalStakedTokensOnSmartContract(scAddress) > 0)
            tf.updateStakerCommissions(scAddress, coverDetails[2]);
        
    }

    /**
     * @dev Makes a vover.
     * @param from address of funder.
     * @param scAddress Smart Contract Address
     */  
    function _verifyCoverDetails(
        address from,
        address scAddress,
        bytes4 coverCurr,
        uint[] coverDetails,
        uint16 coverPeriod,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
    )
        internal
    {
        require(coverDetails[3] > now);
        require(verifySign(coverDetails, coverPeriod, coverCurr, scAddress, _v, _r, _s));
        _makeCover(from, scAddress, coverCurr, coverDetails, coverPeriod);

    }

    /**
     * @dev Updates the Sum Assured Amount of all the quotation.
     * @param _cid Cover id
     * @param _amount that will get subtracted Current Sum Assured 
     * amount that comes under a quotation.
     */ 
    function _removeSAFromCSA(uint _cid, uint _amount) internal checkPause {
        address _add;
        bytes4 coverCurr;
        (, , _add, coverCurr, , ) = qd.getCoverDetailsByCoverID1(_cid);
        qd.subFromTotalSumAssured(coverCurr, _amount);        
        qd.subFromTotalSumAssuredSC(_add, coverCurr, _amount);
    }

    /**
     * @dev to trigger the kyc process 
     * @param status is the kyc status
     * @param _add is the address of member
     */
    function _kycTrigger(bool status, address _add) internal {

        uint holdedCoverLen = qd.getUserHoldedCoverLength(_add) - 1;
        uint holdedCoverID = qd.getUserHoldedCoverByIndex(_add, holdedCoverLen);
        address userAdd;
        address scAddress;
        bytes4 coverCurr;
        uint16 coverPeriod;
        uint[]  memory coverDetails = new uint[](4);
        IERC20 erc20;

        (, userAdd, coverDetails) = qd.getHoldedCoverDetailsByID2(holdedCoverID);
        (, scAddress, coverCurr, coverPeriod) = qd.getHoldedCoverDetailsByID1(holdedCoverID);
        require(qd.refundEligible(userAdd));
        qd.setRefundEligible(userAdd, false);
        uint joinFee = td.joiningFee();
        if (status) {
            mr.payJoiningFee.value(joinFee)(userAdd);
            if (coverDetails[3] > now) { 
                qd.setHoldedCoverIDStatus(holdedCoverID, uint(QuotationData.HCIDStatus.kycPass));
                address poolAdd = ms.getLatestAddress("P1");
                if (coverCurr == "ETH") {
                    poolAdd.transfer(coverDetails[1]);
                } else {
                    erc20 = IERC20(pd.getCurrencyAssetAddress(coverCurr)); //solhint-disable-line
                    erc20.transfer(poolAdd, coverDetails[1]);
                }
                emit RefundEvent(userAdd, status, holdedCoverID, "KYC Passed");               
                _makeCover(userAdd, scAddress, coverCurr, coverDetails, coverPeriod);

            } else {
                qd.setHoldedCoverIDStatus(holdedCoverID, uint(QuotationData.HCIDStatus.kycPassNoCover));
                if (coverCurr == "ETH") {
                    userAdd.transfer(coverDetails[1]);
                } else {
                    erc20 = IERC20(pd.getCurrencyAssetAddress(coverCurr)); //solhint-disable-line
                    erc20.transfer(userAdd, coverDetails[1]);
                }
                emit RefundEvent(userAdd, status, holdedCoverID, "Cover Failed");
            }
        } else {
            qd.setHoldedCoverIDStatus(holdedCoverID, uint(QuotationData.HCIDStatus.kycFailedOrRefunded));
            uint totalRefund = joinFee;
            if (coverCurr == "ETH") {
                totalRefund = coverDetails[1] + joinFee;
            } else {
                erc20 = IERC20(pd.getCurrencyAssetAddress(coverCurr)); //solhint-disable-line
                erc20.transfer(userAdd, coverDetails[1]);
            }
            userAdd.transfer(totalRefund);
            emit RefundEvent(userAdd, status, holdedCoverID, "KYC Failed");
        }
              
    }
}
