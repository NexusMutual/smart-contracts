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


pragma solidity ^0.4.11;
import "./NXMToken.sol";
import "./NXMToken2.sol";
import "./NXMTokenData.sol";
import "./pool.sol";
import "./quotationData.sol";
import "./MCR.sol";
import "./master.sol";
import "./claimsData.sol";
import "./SafeMaths.sol";
contract quotation2 {
    using SafeMaths for uint;
    NXMToken tc1;
    NXMToken2 tc2;
    pool p1;
    quotationData qd;
    NXMTokenData td;
    master ms;
    MCR m1;
    claimsData cd;
    address masterAddress;
    address tokenDataAddress;
    address mcrAddress;
    address tokenAddress;
    address token2Address;
    address poolAddress;
    address quotationDataAddress;
    address claimDataAddress;
    modifier onlyInternal {
        ms=master(masterAddress);
        require(ms.isInternal(msg.sender) == 1);
        _; 
    }
    modifier onlyOwner{
        ms=master(masterAddress);
        require(ms.isOwner(msg.sender) == 1);
        _; 
    }
    modifier checkPause
    {
        ms=master(masterAddress);
        require(ms.isPause()==0);
        _;
    }
    modifier isMemberAndcheckPause
    {
        ms=master(masterAddress);
        require(ms.isPause()==0 && ms.isMember(msg.sender)==true);
        _;
    }

    function changeTokenDataAddress(address _add) onlyInternal
    {
        tokenDataAddress = _add;
        td = NXMTokenData(tokenDataAddress);      
    }
    function changeMCRAddress(address _add) onlyInternal
    {
        mcrAddress = _add;
        m1=MCR(mcrAddress);
    }

    function changeMasterAddress(address _add) 
    {
        if(masterAddress == 0x000)
            masterAddress = _add;
        else
        {
            ms=master(masterAddress);
            if(ms.isInternal(msg.sender) == 1)
                masterAddress = _add;
            else
                throw;
        }     
    }
    function changeTokenAddress(address _add) onlyInternal
    {
        tokenAddress = _add;
    }
    function changeToken2Address(address _add) onlyInternal
    {
        token2Address = _add;
    }
    
    function changeQuotationDataAddress(address _add) onlyInternal
    {
        quotationDataAddress = _add;
        qd = quotationData(quotationDataAddress);
    }
    function changePoolAddress(address _add) onlyInternal
    {
        poolAddress = _add;
    }
    function changeClaimDataAddress(address _add) onlyInternal
    {
        claimDataAddress = _add;
        cd = claimsData(claimDataAddress);
    }

    /// @dev Provides the information of a Cover when given the cover id.
    /// @param _cid Cover Id
    /// @return cid Quotation id against which the cover was generated.
    /// @return validUntil validity timestamp of cover.
    /// @return claimCount Number of claims submitted against a cover.
    /// @return lockedTokens Number of tokens locked against a cover.
    /// @return status Current status of cover. 
    function getCoverByCoverId(uint _cid) constant returns(uint cid,bytes8 productName, uint validUntil,uint lockedTokens,bytes4 curr,bytes16 status)
    {
        qd = quotationData(quotationDataAddress);
        uint16 statusNo;
        (productName,cid,,curr,,statusNo) = qd.getCoverByIndex1(_cid);
        validUntil=qd.getCoverValidity(_cid);
        (,lockedTokens) = td.getUser_cover_lockedCN(qd.getCoverMemberAddress(_cid),_cid);
        status=qd.getCoverStatus(statusNo);
    }
    
    /// @dev Expires a cover after a set period of time. 
    /// @dev Changes the status of the Cover and reduces the current sum assured of all areas in which the quotation lies
    /// @dev Unlocks the CN tokens of the cover. Updates the Total Sum Assured value.
    /// @param _cid Cover Id.
    function expireCover(uint _cid) onlyInternal
    {
        qd = quotationData(quotationDataAddress);
        p1=pool(poolAddress);
        if(checkCoverExpired(_cid) == 1 && qd.getCoverStatusNo(_cid)!=3)
        {
            qd.changeCoverStatus(_cid, 3);
            tc1=NXMToken(tokenAddress);
            tc1.unlockCN(_cid);
            bytes4 curr =  qd.getCurrencyOfCover(_cid);
            qd.subFromTotalSumAssured(curr,qd.getCoverSumAssured(_cid));
            if(qd.getProductNameOfCover(_cid)=="SCC"){
                address scAddress;
                (,scAddress)=qd.getscAddressOfCover(_cid);
                qd.subFromTotalSumAssuredSC(scAddress,curr,qd.getCoverSumAssured(_cid));
            }
        }
    }

    // /// @dev Provides the information of Quotation and Cover for a  given Cover Id.
    // /// @param _cid Cover Id.
    // /// @return claimCount number of claims submitted against a given cover.
    // /// @return lockedTokens number of tokens locked against a cover.
    // /// @return validity timestamp till which cover is valid.
    // /// @return curr Currency in which quotation is assured.
    // /// @return sum Sum Assured of quotation.
    // function getCoverAndQuoteDetails(uint _cid) constant returns(uint8 claimCount , uint lockedTokens, uint validity , bytes4 curr , uint sum)
    // {
    //     qd = quotationData(quotationDataAddress);
    //     td = NXMTokenData(tokenDataAddress);
    //     cd = claimsData(claimDataAddress);
    //     claimCount = SafeMaths.sub8(cd.getCoverClaimCount(_cid),1);
    //     (,lockedTokens) = td.getUser_cover_lockedCN(qd.getCoverMemberAddress(_cid),_cid);
    //     validity = qd.getCoverValidity(_cid);
    //     sum = qd.getCoverSumAssured(_cid);
    //     curr = qd.getCurrencyOfCover(_cid);
    // }

    /// @dev Checks if a cover should get expired/closed or not.
    /// @param _cid Cover Index.
    /// @return expire 1 if the Cover's time has expired, 0 otherwise.
    function checkCoverExpired(uint _cid) constant returns (uint8 expire)
    {
        qd = quotationData(quotationDataAddress);
        if(qd.getCoverValidity(_cid) < uint64(now))
            expire=1;
        else
            expire=0;
    }

    /// @dev Updates the Sum Assured Amount of all the quotation.
    /// @param _cid Cover id
    /// @param _amount that will get subtracted' Current Sum Assured Amount that comes under a quotation.
    function removeSAFromCSA(uint _cid , uint _amount) checkPause
    {
        ms=master(masterAddress);
        if(!(ms.isOwner(msg.sender)==1 || ms.isInternal(msg.sender)==1)) throw;
        qd = quotationData(quotationDataAddress);
        bytes4 coverCurr =  qd.getCurrencyOfCover(_cid);
        address _add;
        (,_add)=qd.getscAddressOfCover(_cid);
        qd.subFromTotalSumAssured(coverCurr,_amount);
        if(qd.getProductNameOfCover(_cid)=="SCC"){
            qd.subFromTotalSumAssuredSC(_add,coverCurr,_amount);
        }
    }

    // /// @dev Creates a new Quotation
    // /// @param arr1 arr1=[productId(Insurance product),sumAssured,coverPeriod(in days)]
    // /// @param arr2 arr2=[currencyCode,Latitude,Longitude]
    // function addBulkQuote(uint[] arr1 ,bytes16[] arr2, /*int[] arr3, bytes32[] arr4, address[] arr5*/ address[] addParams) isMemberAndcheckPause
    // {
    //     uint k=0;
    //     // uint num=arr1.length/3;
    //     // int[][] intParams;
    //     // bytes32[][] bytesParams;
    //     // address[][] addParams;
    //     // uint p=0;
    //     // uint j=0;
    //     // for(j=0;j<arr3.length;j++)
    //     // {
    //     // if(j%(arr3.length/num)==0&&j!=0)p++;
    //     // intParams[p][j%(arr3.length/num)]=arr3[j];

    //     // }
    //     // p=0;
    //     // for( j=0;j<arr4.length;j++)
    //     // {
    //     // if(j%(arr4.length/num)==0&&j!=0)p++;
    //     // bytesParams[p][j%(arr4.length/num)]=arr4[j];

    //     // }
    //     // p=0;
    //     // for( j=0;j<arr5.length;j++)
    //     // {
    //     // if(j%(arr5.length/num)==0&&j!=0)p++;
    //     // addParams[p][j%(arr5.length/num)]=arr5[j];

    //     // }
    //     for(uint i=0;i<arr1.length;i+=3)
    //     {
    //         addCover(uint8(arr1[i+0]),uint16(arr1[i+1]),uint32(arr1[i+2]),bytes4(arr2[i-2*k]),addParams[i]);//,intParams[i-2*k],bytesParams[i-2*k],addParams[i-2*k]);
    //     }
    // }
    
    /// @dev Create cover of the quotation, change the status of the quotation ,update the total sum assured and lock the tokens of the cover of a quote.
    /// @param from Quote member Ethereum address
    function make_Cover(uint16 prodId, address from, address scAddress, bytes4 coverCurr,uint[] coverDetails) internal 
    {
        qd = quotationData(quotationDataAddress);
        p1=pool(poolAddress);
        uint cid=qd.getCoverLength();
        qd.addCover(uint16(coverDetails[0]),uint16(coverDetails[1]),qd.getProductName(prodId),cid,from,coverCurr,scAddress);
        uint coverLength_new=qd.getCoverLength();
        if(SafeMaths.sub(coverLength_new,cid)>1){
            for(uint i=cid; i<coverLength_new; i++){
                if(qd.getCoverMemberAddress(i)==from){ 
                    cid=i;
                    break;
                }
            }
        }
        // if cover period of quote is less than 60 days.
        if(coverDetails[0]<=60)
        {
            p1.closeCoverOraclise(cid,uint64(SafeMaths.mul(coverDetails[0] , 1 days)));
        }
        
        tc2=NXMToken2(token2Address);
        qd.changeLockedTokens(cid,tc2.lockCN(coverDetails[3],uint16(coverDetails[0]),cid,from));
        qd.addInTotalSumAssured(coverCurr,coverDetails[1]);
        if(qd.getProductNameOfCover(prodId)=="SCC" && scAddress != 0x000){ 
            qd.addInTotalSumAssuredSC(scAddress,coverCurr,coverDetails[1]);
            tc1=NXMToken(tokenAddress);
            if(tc1.getTotalLockedNXMToken(scAddress)>0)
                tc1.updateStakerCommissions(scAddress,coverDetails[3]);
        }
        qd.callCoverEvent(from, scAddress, coverDetails[2], "xyz");
    }

    /// @dev Make Cover using NXM tokens.
    /// @param smartCAdd Smart Contract Address
    function makeCoverUsingNXMTokens(uint16 prodId, uint[] coverDetails, bytes4 coverCurr,address smartCAdd,uint8 _v,bytes32 _r,bytes32 _s) isMemberAndcheckPause
    {
        m1=MCR(mcrAddress);
        if(m1.checkForMinMCR() == 1) throw;
        tc1=NXMToken(tokenAddress);
        tc1.burnTokenForFunding(coverDetails[3],msg.sender);
        verifyCoverDetails(prodId,msg.sender,smartCAdd,coverCurr,coverDetails,_v,_r,_s);
    }

    /// @dev Make Cover(s).
    /// @param from address of funder.
    /// @param scAddress Smart Contract Address
    function verifyCoverDetails(uint16 prodId, address from, address scAddress,bytes4 coverCurr,uint[] coverDetails, uint8 _v, bytes32 _r, bytes32 _s) onlyInternal  {
        require(coverDetails[4] > now);
        require(verifySign(coverDetails, coverCurr, scAddress, _v, _r, _s));
        make_Cover(prodId, from, scAddress, coverCurr, coverDetails);
    }

    // /// @dev Gets the Sum Assured amount of quotation when given the cover id.
    // /// @param _cid Cover Id.
    // /// @return result Sum Assured amount.
    // function getSumAssured(uint _cid) constant returns (uint result)
    // {
    //     qd = quotationData(quotationDataAddress);
    //     result=qd.getCoverSumAssured(_cid);
    // }

    // /// @dev Gets the Address of Owner of a given Cover.
    // /// @param _cid Cover Id.
    // /// @return add Owner's address.
    // function getMemberAddress(uint _cid) onlyInternal constant returns (address add) 
    // {
    //     qd = quotationData(quotationDataAddress);
    //     add=qd.getCoverMemberAddress(_cid);
    // }

    // /// @dev Updates the status and claim's count by 1 of an existing cover.
    // /// @param _cid Cover Id.
    // /// @param newstatus New status name.
    // function updateCoverStatusAndCount(uint _cid,uint16 newstatus) onlyInternal
    // {
    //     qd = quotationData(quotationDataAddress);
    //     qd.changeCoverStatus(_cid,newstatus);
    //     cd=claimsData(claimDataAddress);
    //     cd.addCover_Claim(_cid,cd.getCoverClaimCount(_cid)); //cc+1
    // }

    // /// @dev Provides the Cover Details of a given Cover id.
    // /// @param _cid Cover Id.
    // /// @return cid Cover Id.
    // /// @return coverOwner Address of the owner of the cover.
    // /// @return sa Amount of the cover. 
    // function getCoverDetailsForAB(uint _cid) constant returns(uint cid, address coverOwner,uint32 sa)
    // {   
    //     qd = quotationData(quotationDataAddress);
    //     cid = _cid;
    //     coverOwner = qd.getCoverMemberAddress(_cid);
    //     sa = qd.getCoverSumAssured(_cid);
    // }

    // /// @dev Get Product ID.
    // /// @param _cid Cover Id
    // function getCoverProductName(uint _cid) constant returns(bytes8)
    // {
    //     qd = quotationData(quotationDataAddress);
    //     return qd.getProductNameOfCover(_cid);
    // }   
    
    function verifySign(uint[] coverDetails,bytes4 curr,address smaratCA,uint8 _v,bytes32 _r,bytes32 _s)  returns(bool)
    {
        bytes32 hash = getOrderHash(coverDetails,curr,smaratCA);
        return  isValidSignature(hash,_v,_r,_s);
    }
   
    function getOrderHash(uint[] coverDetails,bytes4 curr,address smaratCA) constant returns (bytes32)
    {
        return keccak256(coverDetails[1],curr,coverDetails[0],smaratCA,coverDetails[2],coverDetails[3],coverDetails[4]);
    }
    
    function isValidSignature(bytes32 hash, uint8 v, bytes32 r, bytes32 s) constant  returns(bool)
    {
        qd = quotationData(quotationDataAddress);
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixedHash = keccak256(prefix, hash);
        address a= ecrecover(prefixedHash, v, r, s);      
        return (a==qd.getAuthQuoteEngine());
    }
}
