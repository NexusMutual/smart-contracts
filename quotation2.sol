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
import "./nxmToken.sol";
import "./nxmToken2.sol";
import "./nxmTokenData.sol";
import "./pool.sol";
import "./quotationData.sol";
import "./mcr.sol";
import "./master.sol";
// import "./memberRoles.sol";
import "./SafeMaths.sol";
contract quotation2 {
    using SafeMaths for uint;
    nxmToken tc1;
    nxmToken2 tc2;
    nxmTokenData td;
    pool p1;
    quotationData qd;
    master ms;
    mcr m1;
    // memberRoles mr;
    
    address masterAddress;
    // address mcrAddress;
    // address nxmTokenAddress;
    // address nxmToken2Address;
    // address poolAddress;
    // address quotationDataAddress;

    function changeMasterAddress(address _add) {
        if(masterAddress == 0x000){
            masterAddress = _add;
            ms=master(masterAddress);
        }
        else {
            ms=master(masterAddress);
            if(ms.isInternal(msg.sender) == true)
                masterAddress = _add;
            else
                throw;
        }     
    }
    modifier onlyInternal {
        // ms=master(masterAddress);
        require(ms.isInternal(msg.sender) == true);
        _; 
    }
    modifier onlyOwner {
        // ms=master(masterAddress);
        require(ms.isOwner(msg.sender) == true);
        _; 
    }
    modifier checkPause {
        // ms=master(masterAddress);
        require(ms.isPause()==false);
        _;
    }
    modifier isMemberAndcheckPause {
        // ms=master(masterAddress);
        require(ms.isPause()==false && ms.isMember(msg.sender)==true);
        _;
    }
    // function changeMemberRolesAddress(address memberRolesAddress) onlyInternal
    // {
    //     // memberRolesAddress = _add;
    //     mr=memberRoles(memberRolesAddress);
    // }
    function changeMCRAddress(address mcrAddress) onlyInternal
    {
        // mcrAddress = _add;
        m1=mcr(mcrAddress);
    }
    function changeTokenAddress(address nxmTokenAddress) onlyInternal
    {
        // nxmTokenAddress = _add;
        tc1=nxmToken(nxmTokenAddress);
    }
    function changeToken2Address(address nxmToken2Address) onlyInternal
    {
        // nxmToken2Address = _add;
        tc2=nxmToken2(nxmToken2Address);
    }
    
    function changeTokenDataAddress(address nxmTokenDataAddress) onlyInternal
    {
        // nxmToken2Address = _add;
        td=nxmTokenData(nxmTokenDataAddress);
    }
    
    function changeQuotationDataAddress(address quotationDataAddress) onlyInternal
    {
        // quotationDataAddress = _add;
        qd=quotationData(quotationDataAddress);
    }
    function changePoolAddress(address poolAddress) onlyInternal
    {
        // poolAddress = _add;
        p1=pool(poolAddress);
    }
    // function changeClaimDataAddress(address _add) onlyInternal
    // {
    //     claimDataAddress = _add;
    //     cd = claimsData(claimDataAddress);
    // }

    // /// @dev Provides the information of a Cover when given the cover id.
    // /// @param _cid Cover Id
    // /// @return cid Quotation id against which the cover was generated.
    // /// @return validUntil validity timestamp of cover.
    // /// @return claimCount Number of claims submitted against a cover.
    // /// @return lockedTokens Number of tokens locked against a cover.
    // /// @return status Current status of cover. 
    // function getCoverByCoverId(uint _cid) constant returns(uint cid,bytes8 productName, uint validUntil,uint lockedTokens,bytes4 curr,bytes16 status)
    // {
    //     qd = quotationData(quotationDataAddress);
    //     uint16 statusNo;
    //     (productName,cid,,curr,,statusNo) = qd.getCoverDetailsByCoverID(_cid);
    //     validUntil=qd.getCoverValidity(_cid);
    //     (,lockedTokens) = td.getUser_cover_lockedCN(qd.getCoverMemberAddress(_cid),_cid);
    //     status=qd.getCoverStatus(statusNo);
    // }
    
    /// @dev Expires a cover after a set period of time. 
    /// @dev Changes the status of the Cover and reduces the current sum assured of all areas in which the quotation lies
    /// @dev Unlocks the CN tokens of the cover. Updates the Total Sum Assured value.
    /// @param _cid Cover Id.
    function expireCover(uint _cid) onlyInternal
    {
        // qd = quotationData(quotationDataAddress);
        // p1=pool(poolAddress);
        if(checkCoverExpired(_cid) == 1 && qd.getCoverStatusNo(_cid)!=3)
        {
            qd.changeCoverStatusNo(_cid, 3);
            // tc1=nxmToken(nxmTokenAddress);
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
    //     td = nxmTokenData(tokenDataAddress);
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
        // qd = quotationData(quotationDataAddress);
        if(qd.getValidityOfCover(_cid) < uint64(now))
            expire=1;
        else
            expire=0;
    }

    /// @dev Updates the Sum Assured Amount of all the quotation.
    /// @param _cid Cover id
    /// @param _amount that will get subtracted' Current Sum Assured Amount that comes under a quotation.
    function removeSAFromCSA(uint _cid , uint _amount) checkPause
    {
        // ms=master(masterAddress);
        if(!(ms.isOwner(msg.sender)==true || ms.isInternal(msg.sender)==true)) throw;
        // qd = quotationData(quotationDataAddress);
        bytes4 coverCurr = qd.getCurrencyOfCover(_cid);
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
    function make_Cover(uint prodId, address from, address scAddress, bytes4 coverCurr,uint[] coverDetails,uint16 coverPeriod) internal 
    {
        // qd = quotationData(quotationDataAddress);
        // p1=pool(poolAddress);
        uint cid=qd.getCoverLength();
        qd.addCover(coverPeriod,coverDetails[0],qd.getProductName(prodId),from,coverCurr,scAddress);
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
        if(coverPeriod<=60)
        {
            p1.closeCoverOraclise(cid,uint64(SafeMaths.mul(coverPeriod, 1 days)));
        }
        
        // tc2=nxmToken2(token2Address);
        // qd.changeLockedTokens(cid,tc2.lockCN(coverDetails[2],coverPeriod,cid,from));
        tc2.lockCN(coverDetails[2],coverPeriod,cid,from);
        qd.addInTotalSumAssured(coverCurr,coverDetails[0]);
        if(qd.getProductName(prodId)=="SCC" && scAddress != 0x000){ 
            qd.addInTotalSumAssuredSC(scAddress,coverCurr,coverDetails[0]);
            // tc1=nxmToken(nxmTokenAddress);
            if(tc1.getTotalLockedNXMToken(scAddress)>0)
                tc1.updateStakerCommissions(scAddress,coverDetails[2]);
        }
       // qd.callCoverEvent(from, scAddress, coverDetails[2], "");
    }

    /// @dev Make Cover using NXM tokens.
    /// @param smartCAdd Smart Contract Address
    function makeCoverUsingNXMTokens(uint prodId, uint[] coverDetails,uint16 coverPeriod, bytes4 coverCurr,address smartCAdd,uint8 _v,bytes32 _r,bytes32 _s) isMemberAndcheckPause
    {
        // m1=mcr(mcrAddress);
        if(m1.checkForMinMCR() == 1) throw;
        // tc1=nxmToken(nxmTokenAddress);
        tc1.burnTokenForFunding(coverDetails[2],msg.sender,"BurnForFunding",0);
        verifyCoverDetailsIntrnl(prodId,msg.sender,smartCAdd,coverCurr,coverDetails,coverPeriod,_v,_r,_s);
    }
    
    /// @dev Make Cover(s).
    /// @param from address of funder.
    /// @param scAddress Smart Contract Address
    function verifyCoverDetailsIntrnl(uint prodId, address from, address scAddress,bytes4 coverCurr,uint[] coverDetails,uint16 coverPeriod, uint8 _v, bytes32 _r, bytes32 _s) internal  {
        require(coverDetails[3] > now);
        require(verifySign(coverDetails,coverPeriod, coverCurr, scAddress, _v, _r, _s));
        make_Cover(prodId, from, scAddress, coverCurr, coverDetails,coverPeriod);
    }

    /// @dev Make Cover(s).
    /// @param from address of funder.
    /// @param scAddress Smart Contract Address
    function verifyCoverDetails(uint prodId, address from, address scAddress,bytes4 coverCurr,uint[] coverDetails,uint16 coverPeriod, uint8 _v, bytes32 _r, bytes32 _s) onlyInternal  {
        verifyCoverDetailsIntrnl( prodId,  from,  scAddress, coverCurr, coverDetails, coverPeriod,  _v,  _r,  _s);
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
    
    function verifySign(uint[] coverDetails,uint16 coverPeriod,bytes4 curr,address smaratCA,uint8 _v,bytes32 _r,bytes32 _s) constant  returns(bool)
    {
        bytes32 hash = getOrderHash(coverDetails,coverPeriod,curr,smaratCA);
        return  isValidSignature(hash,_v,_r,_s);
    }
   
    function getOrderHash(uint[] coverDetails,uint16 coverPeriod,bytes4 curr,address smaratCA) constant returns (bytes32)
    {
        return keccak256(coverDetails[0],curr,coverPeriod,smaratCA,coverDetails[1],coverDetails[2],coverDetails[3]);
    }
    
    function isValidSignature(bytes32 hash, uint8 v, bytes32 r, bytes32 s) constant  returns(bool)
    {
        // qd = quotationData(quotationDataAddress);
        bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        bytes32 prefixedHash = keccak256(prefix, hash);
        address a= ecrecover(prefixedHash, v, r, s);      
        return (a==qd.getAuthQuoteEngine());
    }
    
    // function getCoverDetailsByCoverID(uint _cid) constant returns(uint cid,bytes4 currencyCode,uint sumAssured,uint16 coverPeriod,uint validUntil,uint lockCN,uint requiredTokenDeposit,uint coverLength){
    //     (cid,currencyCode,sumAssured,coverPeriod,validUntil) = qd.getCoverDetailsByCoverID2(_cid);
    //     address memberAdd = qd.getCoverMemberAddress(_cid);
    //     (,,lockCN) = td.getUser_cover_lockedCN(memberAdd,_cid);
    //     // (,,,requiredTokenDeposit) = td.getUser_cover_depositCNByIndex(memberAdd,_cid,0);
    //     // (,coverLength) = td.getUser_cover_depositCNLength(memberAdd,_cid);
    //     return (cid,currencyCode,sumAssured,coverPeriod,validUntil,lockCN,requiredTokenDeposit,coverLength);
    // }
}
