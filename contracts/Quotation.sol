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

import "./NXMToken.sol";
import "./TokenData.sol";
import "./TokenFunctions.sol";
import "./TokenController.sol";
import "./Pool1.sol";
import "./PoolData.sol";
import "./QuotationData.sol";
import "./MCR.sol";
import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMath.sol";
import "./imports/openzeppelin-solidity/token/ERC20/ERC20.sol";


contract Quotation is Iupgradable {
    using SafeMath for uint;

    TokenFunctions internal tf;
    TokenController internal tc;
    TokenData internal td;
    Pool1 internal p1;
    PoolData internal pd;
    QuotationData internal qd;
    MCR internal m1;

    event RefundEvent(address indexed user, bool indexed status, uint holdedCoverID, bytes32 reason);

    function () public payable {} //solhint-disable-line

    modifier onlyOwner {

        require(ms.isOwner(msg.sender) == true);
        _;
    }

    modifier checkPause {

        require(ms.isPause() == false);
        _;
    }

    modifier isMemberAndcheckPause {

        require(ms.isPause() == false && ms.isMember(msg.sender) == true);
        _;
    }

    function changeDependentContractAddress() public onlyInternal {
        m1 = MCR(ms.getLatestAddress("MC"));
        tf = TokenFunctions(ms.getLatestAddress("TF"));
        tc = TokenController(ms.getLatestAddress("TC"));
        td = TokenData(ms.getLatestAddress("TD"));
        qd = QuotationData(ms.getLatestAddress("QD"));
        p1 = Pool1(ms.getLatestAddress("P1"));
        pd = PoolData(ms.getLatestAddress("PD"));
    }

    /**
     * @dev Expires a cover after a set period of time.
     * Changes the status of the Cover and reduces the current
     * sum assured of all areas in which the quotation lies
     * Unlocks the CN tokens of the cover. Updates the Total Sum Assured value.
     * @param _cid Cover Id.
     */ 
    function expireCover(uint _cid) public onlyInternal {
        require(checkCoverExpired(_cid) == 1 && qd.getCoverStatusNo(_cid) != 3);
        qd.changeCoverStatusNo(_cid, 3);
        tf.unlockCN(_cid);
        bytes4 curr;
        address scAddress;
        uint SA;
        bytes8 prodID;
        (, prodID, , scAddress, curr, SA) = qd.getCoverDetailsByCoverID1(_cid);
        qd.subFromTotalSumAssured(curr, SA);
        if (prodID == "SCC") {
            qd.subFromTotalSumAssuredSC(scAddress, curr, SA);
        }
    }

    /**
     * @dev Checks if a cover should get expired/closed or not.
     * @param _cid Cover Index.
     * @return expire 1 if the Cover's time has expired, 0 otherwise.
     */ 
    function checkCoverExpired(uint _cid) public view returns(uint8 expire) {

        if (qd.getValidityOfCover(_cid) < uint64(now))
            expire = 1;
        else
            expire = 0;
    }

    /**
     * @dev Updates the Sum Assured Amount of all the quotation.
     * @param _cid Cover id
     * @param _amount that will get subtracted Current Sum Assured 
     * amount that comes under a quotation.
     */ 
    function removeSAFromCSA(uint _cid, uint _amount) public checkPause onlyInternal {

        address _add;
        bytes4 coverCurr;
        bytes8 prodID;
        ( , prodID, , _add, coverCurr, ) = qd.getCoverDetailsByCoverID1(_cid);
        qd.subFromTotalSumAssured(coverCurr, _amount);
        if (prodID == "SCC") {
            qd.subFromTotalSumAssuredSC(_add, coverCurr, _amount);
        }
    }

    /**
     * @dev Makes Cover funded via NXM tokens.
     * @param smartCAdd Smart Contract Address
     */ 
    function makeCoverUsingNXMTokens(
        uint prodId,
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
        _verifyCoverDetails(prodId, msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
    }

    /**
     * @dev Verifies cover details signed off chain.
     * @param from address of funder.
     * @param scAddress Smart Contract Address
     */
    function verifyCoverDetails(
        uint prodId,
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
            prodId,
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

    function verifyQuote(
        uint prodId,
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
            ERC20 erc20 = ERC20(pd.getCurrencyAssetAddress(coverCurr));
            require(erc20.transferFrom(msg.sender, address(this), coverDetails[1]));
        }
        require(msg.value == totalFee);
        require(verifySign(coverDetails, coverPeriod, coverCurr, smartCAdd, _v, _r, _s));
        qd.addHoldCover(prodId, msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod);
        qd.setRefundEligible(msg.sender, true);
    }

    function kycTrigger(bool status, uint holdedCoverID) public checkPause {
        address userAdd;
        address scAddress;
        uint prodId;
        bytes4 coverCurr;
        uint16 coverPeriod;
        uint[]  memory coverDetails = new uint[](4);
        ERC20 erc20;

        (, userAdd, coverDetails) = qd.getHoldedCoverDetailsByID2(holdedCoverID);
        (, prodId, scAddress, coverCurr, coverPeriod) = qd.getHoldedCoverDetailsByID1(holdedCoverID);
        require(qd.refundEligible(userAdd));
        qd.setRefundEligible(userAdd, false);
        uint joinFee = td.joiningFee();
        if (status) {
            tf.payJoiningFee.value(joinFee)(userAdd);
            if (coverDetails[3] > now) { 
                qd.setHoldedCoverIDStatus(holdedCoverID, 2);
                address poolAdd = ms.getLatestAddress("P1");
                if (coverCurr == "ETH") {
                    poolAdd.transfer(coverDetails[1]);
                } else {
                    erc20 = ERC20(pd.getCurrencyAssetAddress(coverCurr)); //solhint-disable-line
                    erc20.transfer(poolAdd, coverDetails[1]);
                }
                emit RefundEvent(userAdd, status, holdedCoverID, "KYC Passed");               
                makeCover(prodId, userAdd, scAddress, coverCurr, coverDetails, coverPeriod);

            } else {
                qd.setHoldedCoverIDStatus(holdedCoverID, 4);
                if (coverCurr == "ETH") {
                    userAdd.transfer(coverDetails[1]);
                } else {
                    erc20 = ERC20(pd.getCurrencyAssetAddress(coverCurr)); //solhint-disable-line
                    erc20.transfer(userAdd, coverDetails[1]);
                }
                emit RefundEvent(userAdd, status, holdedCoverID, "Cover Failed");
            }
        } else {
            qd.setHoldedCoverIDStatus(holdedCoverID, 3);
            uint totalRefund = joinFee;
            if (coverCurr == "ETH") {
                totalRefund = coverDetails[1] + joinFee;
            } else {
                erc20 = ERC20(pd.getCurrencyAssetAddress(coverCurr)); //solhint-disable-line
                erc20.transfer(userAdd, coverDetails[1]);
            }
            userAdd.transfer(totalRefund);
            emit RefundEvent(userAdd, status, holdedCoverID, "KYC Failed");
        }
              
    }
    
    function fullRefund(uint holdedCoverID) public checkPause {
        uint holdedCoverLen = qd.getUserHoldedCoverLength(msg.sender) - 1;
        require(qd.getUserHoldedCoverByIndex(msg.sender, holdedCoverLen) == holdedCoverID);
        kycTrigger(false, holdedCoverID);
    }

    /**
     * @dev Transfers back the given amount to the owner.
     */  
    function transferBackAssets() public onlyOwner {
        uint amount = address(this).balance;
        address walletAdd = td.walletAddress();
        ERC20 erc20;
        if (amount > 0) {
            walletAdd.transfer(amount);   
        }
        uint currAssetLen = pd.getAllCurrenciesLen();
        for (uint64 i = 1; i < currAssetLen; i++) {
            bytes8 currName = pd.getAllCurrenciesByIndex(i);
            address currAddr = pd.getCurrencyAssetAddress(currName);
            erc20 = ERC20(currAddr); //solhint-disable-line
            if (erc20.balanceOf(this) > 0) {
                erc20.transfer(walletAdd, erc20.balanceOf(this));
            }
        }
    }

    /**
     * @dev transfering Ethers to newly created quotation contract.
     */  
    function transferAssetsToNewContract(address newAdd) public onlyInternal {
        uint amount = address(this).balance;
        ERC20 erc20;
        if (amount > 0) {
            newAdd.transfer(amount);   
        }
        uint currAssetLen = pd.getAllCurrenciesLen();
        for (uint64 i = 1; i < currAssetLen; i++) {
            bytes8 currName = pd.getAllCurrenciesByIndex(i);
            address currAddr = pd.getCurrencyAssetAddress(currName);
            erc20 = ERC20(currAddr); //solhint-disable-line
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
    function makeCover(
        uint prodId,
        address from,
        address scAddress,
        bytes4 coverCurr,
        uint[] coverDetails,
        uint16 coverPeriod
    )
        internal
    {
        uint cid = qd.getCoverLength();
        qd.addCover(coverPeriod, coverDetails[0], qd.getProductName(prodId),
            from, coverCurr, scAddress, coverDetails[1]);
        uint coverLengthNew = qd.getCoverLength();
        if (coverLengthNew.sub(cid) > 1) {
            for (uint i = cid; i < coverLengthNew; i++) {
                if (qd.getCoverMemberAddress(i) == from) {
                    cid = i;
                    break;
                }
            }
        }
        // if cover period of quote is less than 60 days.
        if (coverPeriod <= 60) {
            p1.closeCoverOraclise(cid, uint64(coverPeriod * 1 days));
        }
        uint coverNoteAmount = (coverDetails[2].mul(10)).div(100);
        tc.mint(from, coverNoteAmount);
        tf.lockCN(coverNoteAmount, coverPeriod, cid, from);
        qd.addInTotalSumAssured(coverCurr, coverDetails[0]);
        if (qd.getProductName(prodId) == "SCC" && scAddress != address(0)) {
            qd.addInTotalSumAssuredSC(scAddress, coverCurr, coverDetails[0]);
            if (tf.getTotalStakedTokensOnSmartContract(scAddress) > 0)
                tf.updateStakerCommissions(scAddress, coverDetails[2]);
        }
    }

    /**
     * @dev Makes a vover.
     * @param from address of funder.
     * @param scAddress Smart Contract Address
     */  
    function _verifyCoverDetails(
        uint prodId,
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
        makeCover(prodId, from, scAddress, coverCurr, coverDetails, coverPeriod);

    }
}
