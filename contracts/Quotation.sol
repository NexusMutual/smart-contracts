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

pragma solidity ^0.4.24;

import "./NXMToken1.sol";
import "./NXMToken2.sol";
import "./NXMTokenData.sol";
import "./Pool1.sol";
import "./PoolData.sol";
import "./QuotationData.sol";
import "./MCR.sol";
import "./NXMaster.sol";
import "./Iupgradable.sol";
import "./imports/openzeppelin-solidity/math/SafeMaths.sol";
import "./imports/openzeppelin-solidity/token/ERC20/StandardToken.sol";


contract Quotation is Iupgradable {
    using SafeMaths
    for uint;

    NXMToken1 tc1;
    NXMToken2 tc2;
    NXMTokenData td;
    Pool1 p1;
    PoolData pd;
    QuotationData qd;
    NXMaster ms;
    MCR m1;
    StandardToken stok;

    address masterAddress;

    event RefundEvent(address indexed user, bool indexed status, uint holdedCoverID, bytes32 reason);

    function changeMasterAddress(address _add) {
        if (masterAddress == 0x000) {
            masterAddress = _add;
            ms = NXMaster(masterAddress);
        } else {
            ms = NXMaster(masterAddress);
            require(ms.isInternal(msg.sender) == true);
            masterAddress = _add;

        }
    }

    modifier onlyInternal {

        require(ms.isInternal(msg.sender) == true);
        _;
    }

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

    function changeDependentContractAddress() onlyInternal {
        uint currentVersion = ms.currentVersion();
        m1 = MCR(ms.versionContractAddress(currentVersion, "MCR"));
        tc1 = NXMToken1(ms.versionContractAddress(currentVersion, "TOK1"));
        tc2 = NXMToken2(ms.versionContractAddress(currentVersion, "TOK2"));
        td = NXMTokenData(ms.versionContractAddress(currentVersion, "TD"));
        qd = QuotationData(ms.versionContractAddress(currentVersion, "QD"));
        p1 = Pool1(ms.versionContractAddress(currentVersion, "P1"));
        pd = PoolData(ms.versionContractAddress(currentVersion, "PD"));

    }

    /// @dev Expires a cover after a set period of time.
    /// @dev Changes the status of the Cover and reduces the current sum assured of all areas in which the quotation lies
    /// @dev Unlocks the CN tokens of the cover. Updates the Total Sum Assured value.
    /// @param _cid Cover Id.
    function expireCover(uint _cid) onlyInternal {

        if (checkCoverExpired(_cid) == 1 && qd.getCoverStatusNo(_cid) != 3) {
            qd.changeCoverStatusNo(_cid, 3);

            tc2.unlockCN(_cid);
            bytes4 curr = qd.getCurrencyOfCover(_cid);
            qd.subFromTotalSumAssured(curr, qd.getCoverSumAssured(_cid));
            if (qd.getProductNameOfCover(_cid) == "SCC") {
                address scAddress;
                (, scAddress) = qd.getscAddressOfCover(_cid);
                qd.subFromTotalSumAssuredSC(scAddress, curr, qd.getCoverSumAssured(_cid));
            }
        }
    }

    /// @dev Checks if a cover should get expired/closed or not.
    /// @param _cid Cover Index.
    /// @return expire 1 if the Cover's time has expired, 0 otherwise.
    function checkCoverExpired(uint _cid) constant returns(uint8 expire) {

        if (qd.getValidityOfCover(_cid) < uint64(now))
            expire = 1;
        else
            expire = 0;
    }

    /// @dev Updates the Sum Assured Amount of all the quotation.
    /// @param _cid Cover id
    /// @param _amount that will get subtracted' Current Sum Assured Amount that comes under a quotation.
    function removeSAFromCSA(uint _cid, uint _amount) checkPause {

        require(!(ms.isOwner(msg.sender) != true && ms.isInternal(msg.sender) != true));
        bytes4 coverCurr = qd.getCurrencyOfCover(_cid);
        address _add;
        (, _add) = qd.getscAddressOfCover(_cid);
        qd.subFromTotalSumAssured(coverCurr, _amount);
        if (qd.getProductNameOfCover(_cid) == "SCC") {
            qd.subFromTotalSumAssuredSC(_add, coverCurr, _amount);
        }
    }

    /// @dev Makes Cover funded via NXM tokens.
    /// @param smartCAdd Smart Contract Address
    function makeCoverUsingNXMTokens(
        uint prodId,
        uint[] coverDetails,
        uint16 coverPeriod,
        bytes4 coverCurr,
        address smartCAdd,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
        ) isMemberAndcheckPause {

        require(m1.checkForMinMCR() != 1);
        //tc1.burnTokenForFunding(coverDetails[2], msg.sender, "BurnForFunding", 0);
        tc1.burnToken(msg.sender, "BurnCP", 0, coverDetails[2]);
        tc1.callTransferEvent(msg.sender, 0, coverDetails[2]);
        verifyCoverDetailsIntrnl(prodId, msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
    }

    /// @dev Verifies cover details signed off chain.
    /// @param from address of funder.
    /// @param scAddress Smart Contract Address
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
        ) onlyInternal {
        verifyCoverDetailsIntrnl(prodId, from, scAddress, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
    }

    /// @dev Verifies signature.
    /// @param coverDetails details related to cover.
    /// @param coverPeriod validity of cover.
    /// @param smaratCA smarat contract address.
    /// @param _v argument from vrs hash.
    /// @param _r argument from vrs hash.
    /// @param _s argument from vrs hash.
    function verifySign(
        uint[] coverDetails,
        uint16 coverPeriod,
        bytes4 curr,
        address smaratCA,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
        ) constant returns(bool) {
        bytes32 hash = getOrderHash(coverDetails, coverPeriod, curr, smaratCA);
        return isValidSignature(hash, _v, _r, _s);
    }

    /// @dev Gets order hash for given cover details.
    /// @param coverDetails details realted to cover.
    /// @param coverPeriod validity of cover.
    /// @param smaratCA smarat contract address.
    function getOrderHash(uint[] coverDetails, uint16 coverPeriod, bytes4 curr, address smaratCA) constant returns(bytes32) {
        return keccak256(coverDetails[0], curr, coverPeriod, smaratCA, coverDetails[1], coverDetails[2], coverDetails[3]);
    }

    /// @dev Verifies signature.
    /// @param hash order hash
    /// @param v argument from vrs hash.
    /// @param r argument from vrs hash.
    /// @param s argument from vrs hash.
    function isValidSignature(bytes32 hash, uint8 v, bytes32 r, bytes32 s) constant returns(bool) {

        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixedHash = keccak256(prefix, hash);
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
        ) payable checkPause {
        require(coverDetails[3] > now);
        require(!ms.isMember(msg.sender));
        require(qd.refundEligible(msg.sender) == false);
        uint joinFee = td.joiningFee();
        uint totalFee = joinFee;
        if (coverCurr == "ETH")
            totalFee = joinFee + coverDetails[1];
        else {
            stok = StandardToken(pd.getCurrencyAssetAddress(coverCurr));
            stok.transferFrom(msg.sender, this, coverDetails[1]);
        }
        require(msg.value == totalFee);
        require(verifySign(coverDetails, coverPeriod, coverCurr, smartCAdd, _v, _r, _s));
        qd.addHoldCover(prodId, msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod);
        qd.setRefundEligible(msg.sender, true);

    }

    function kycTrigger(bool status, uint holdedCoverID) checkPause {

        address userAdd;
        uint[]  memory coverDetails = new uint[](4);
        (, userAdd, coverDetails) = qd.getHoldedCoverDetailsByID2(holdedCoverID);
        require(qd.refundEligible(userAdd));
        qd.setRefundEligible(userAdd, false);
        bool succ;
        uint joinFee = td.joiningFee();
        if (status) {
            address scAddress;
            uint prodId;
            bytes4 coverCurr;
            uint16 coverPeriod;
            (, prodId, scAddress, coverCurr, coverPeriod) = qd.getHoldedCoverDetailsByID1(holdedCoverID);
            tc2.payJoiningFee.value(joinFee)(userAdd);
            if (coverDetails[3] > now) { 
                qd.setHoldedCoverIDStatus(holdedCoverID, 2);
                uint currentVersion = ms.currentVersion();
                address poolAdd = ms.versionContractAddress(currentVersion, "P1");
                if (coverCurr == "ETH") {
                    succ = poolAdd.send(coverDetails[1]);
                    require(succ);
                }else {
                    stok = StandardToken(pd.getCurrencyAssetAddress(coverCurr));
                    stok.transfer(poolAdd, coverDetails[1]);
                }
                RefundEvent(userAdd, status, holdedCoverID, "KYC Passed");               
                makeCover(prodId, userAdd, scAddress, coverCurr, coverDetails, coverPeriod);

            }else {
                qd.setHoldedCoverIDStatus(holdedCoverID, 4);
                if (coverCurr == "ETH") {
                    succ = userAdd.send(coverDetails[1]);
                    require(succ);
                }else {
                    stok = StandardToken(pd.getCurrencyAssetAddress(coverCurr));
                    stok.transfer(userAdd, coverDetails[1]);
                }
                RefundEvent(userAdd, status, holdedCoverID, "Cover Failed");
            }


        }else {
            qd.setHoldedCoverIDStatus(holdedCoverID, 3);
            uint totalRefund = joinFee;
            if (coverCurr == "ETH") {
                totalRefund = coverDetails[1] + joinFee;
            }else {
                stok = StandardToken(pd.getCurrencyAssetAddress(coverCurr));
                stok.transfer(userAdd, coverDetails[1]);
            }
            succ = userAdd.send(totalRefund);
            require(succ);
            RefundEvent(userAdd, status, holdedCoverID, "KYC Failed");
        }
              
    }
    
    function fullRefund(uint holdedCoverID) checkPause {

        uint holdedCoverLen = qd.getUserHoldedCoverLength(msg.sender) - 1;
        require(qd.getUserHoldedCoverByIndex(msg.sender, holdedCoverLen) == holdedCoverID);
        kycTrigger(false, holdedCoverID);
        
    }

    /// @dev Transfers back the given amount to the owner.
    function transferBackAssets() onlyOwner  
    {

        uint amount = this.balance;
        address walletAdd = td.walletAddress();
        if (amount > 0) {
              
            bool succ = walletAdd.send(amount);   
            require(succ);
        }
        uint currAssetLen = pd.getAllCurrenciesLen();
        for (uint64 i = 1; i < currAssetLen; i++) {
            bytes8 currName = pd.getAllCurrenciesByIndex(i);
            address currAddr = pd.getCurrencyAssetAddress(currName);
            stok = StandardToken(currAddr);
            if (stok.balanceOf(this) > 0) {
                stok.transfer(walletAdd, stok.balanceOf(this));
            }
        }

    }

    /// @dev transfering Ethers to newly created quotation contract.
    function transferAssetsToNewContract(address newAdd) onlyInternal
    {
        uint amount = this.balance;
        if (amount > 0) {
            bool succ = newAdd.send(amount);   
            require(succ);
        }
        uint currAssetLen = pd.getAllCurrenciesLen();
        for (uint64 i = 1; i < currAssetLen; i++) {
            bytes8 currName = pd.getAllCurrenciesByIndex(i);
            address currAddr = pd.getCurrencyAssetAddress(currName);
            stok = StandardToken(currAddr);
            if (stok.balanceOf(this) > 0) {
                stok.transfer(newAdd, stok.balanceOf(this));
            }
        }
    }

    /// @dev Creates cover of the quotation, changes the status of the quotation ,
    //                updates the total sum assured and locks the tokens of the cover against a quote.
    /// @param from Quote member Ethereum address
    function makeCover(uint prodId, address from, address scAddress, bytes4 coverCurr, uint[] coverDetails, uint16 coverPeriod) internal {

        uint cid = qd.getCoverLength();
        qd.addCover(coverPeriod, coverDetails[0], qd.getProductName(prodId), from, coverCurr, scAddress, coverDetails[1]);
        uint coverLengthNew = qd.getCoverLength();
        if (SafeMaths.sub(coverLengthNew, cid) > 1) {
            for (uint i = cid; i < coverLengthNew; i++) {
                if (qd.getCoverMemberAddress(i) == from) {
                    cid = i;
                    break;
                }
            }
        }
        // if cover period of quote is less than 60 days.
        if (coverPeriod <= 60) {
            p1.closeCoverOraclise(cid, uint64(SafeMaths.mul(coverPeriod, 1 days)));
        }

        tc2.lockCN(coverDetails[2], coverPeriod, cid, from);
        qd.addInTotalSumAssured(coverCurr, coverDetails[0]);
        if (qd.getProductName(prodId) == "SCC" && scAddress != 0x000) {
            qd.addInTotalSumAssuredSC(scAddress, coverCurr, coverDetails[0]);
            if (tc1.getTotalLockedNXMToken(scAddress) > 0)
                tc2.updateStakerCommissions(scAddress, coverDetails[2]);
        }
    }

    /// @dev Makes a vover.
    /// @param from address of funder.
    /// @param scAddress Smart Contract Address
    function verifyCoverDetailsIntrnl(
        uint prodId,
        address from,
        address scAddress,
        bytes4 coverCurr,
        uint[] coverDetails,
        uint16 coverPeriod,
        uint8 _v,
        bytes32 _r,
        bytes32 _s
        ) internal {
        require(coverDetails[3] > now);
        require(verifySign(coverDetails, coverPeriod, coverCurr, scAddress, _v, _r, _s));
        makeCover(prodId, from, scAddress, coverCurr, coverDetails, coverPeriod);

    }

}
