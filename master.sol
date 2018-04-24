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
import "./quotation2.sol";
import "./nxmToken.sol";
import "./nxmToken2.sol";
import "./claims.sol";
import "./claimsReward.sol";
import "./pool.sol";
import "./governance.sol";
import "./fiatFaucet.sol";
import "./mcr.sol";
import "./usd.sol";
import "./master2.sol";
import "./claimsData.sol";
import "./quotationData.sol";
import "./nxmTokenData.sol";
import "./poolData.sol";
import "./mcrData.sol";
import "./governanceData.sol";
import "./pool2.sol";
import "./SafeMaths.sol";
import "./pool3.sol";
import "./governance2.sol";
import "./memberRoles.sol";

contract master
{
    using SafeMaths for uint;

    struct contractDetails{
        bytes16 name;
        address contractAddress;
    }
    struct changeVersion{
        uint date_implement;
        uint versionNo;
    }
    struct emergencyPause {
        bool pause;
        uint time;
        bytes4 by;
    }
    emergencyPause[] emergency_Paused;

    uint  public versionLength;
    mapping(uint=>contractDetails[]) public allContractVersions;
    changeVersion[]  contractChangeDate;
    mapping(address=>bool) contracts_active;
        
    address  quoteDataAddress;
    address  nxmTokenDataAddress;
    address  claimDataAddress;
    address  poolDataAddress;
    address  governanceDataAddress;
    address  mcrDataAddress;
    address  nxmTokenAddress;
    address  claimsAddress;
    address  quotation2Address;
    address  nxmToken2Address;
    address  claimsRewardAddress;
    address  poolAddress;
    address  governanceAddress;
    address  fiatFaucetAddress;
    address  mcrAddress;
    address  faucetUSDAddress;                             
    address  faucetEURAddress;
    address  faucetGBPAddress;
    address  masters2Address;
    address  masterAddress;
    address  pool2Address;
    address  governance2Address;
    address  memberAddress;
    //date 21/11/2017
    address zeroExExchangeAddress;
    address pool3Address;
    
    claimsData cd;
    quotation2 q2;
    nxmToken tc1;
    nxmToken2 tc2;
    claims c1;
    claimsReward cr;
    pool p1;
    governance g1;
    governance2 g2;
    fiatFaucet f1;
    mcr m1;
    SupplyToken s1;
    masters2 m2;
    quotationData qd;
    nxmTokenData td;
    governanceData gd;
    poolData pd;
    mcrData md;
    pool2 p2;
    pool3 p3;
    memberRoles mr;

    address public owner;
    uint pauseTime;
    modifier onlyOwner {  
        require(isOwner(msg.sender) == true);
        _; 
    }
    modifier onlyInternal {
        require( (contracts_active[msg.sender] == true || owner==msg.sender)); //&& emergencyPaused==0
        _; 
    }
    modifier checkPause { 
        require(isPause()==false);
        _; 
    }
    
    /// @dev Constructor
    function master()
    {
        owner=msg.sender;
        contracts_active[masterAddress]=false; //0
        contracts_active[address(this)]=true; //1
        masterAddress=address(this);
        versionLength =0;
        pauseTime=SafeMaths.mul(28,1 days); //4 weeks
    }

    /// @dev Add Emergency pause
    /// @param _pause to set Emergency Pause ON/OFF
    /// @param _by to set who Start/Stop EP
    function addEmergencyPause(bool _pause,bytes4 _by) onlyInternal
    {
        emergency_Paused.push(emergencyPause(_pause,now,_by));
        if(_pause==false)
        {
            // c1=claims(claimsAddress);
            c1.submitClaimAfterEPOff();     //Submitting Requested Claims.
            // cr=claimsReward(claimsRewardAddress);
            cr.StartAllPendingClaimsVoting();   //Start Voting of pending Claims again.
        }
    }
    ///@dev update time in seconds for which emergency pause is applied.
    function updatePauseTime(uint _time) onlyInternal
    {
        pauseTime=_time;
    }
    ///@dev get time in seconds for which emergency pause is applied.
    function getPauseTime() constant returns(uint _time)
    {
        return pauseTime;
    }
    /// @dev Changes all reference contract addresses in master
    function changeAddressinMaster(uint version) onlyInternal
    {
       changeAllAddress1(version);
       changeAllAddress2(version);
       quoteDataAddress = allContractVersions[version][1].contractAddress;
       nxmTokenDataAddress = allContractVersions[version][2].contractAddress;
       claimDataAddress = allContractVersions[version][3].contractAddress;
       poolDataAddress = allContractVersions[version][4].contractAddress;
       governanceDataAddress = allContractVersions[version][5].contractAddress;
       mcrDataAddress = allContractVersions[version][6].contractAddress;        
       quotation2Address = allContractVersions[version][8].contractAddress;
       nxmTokenAddress=allContractVersions[version][9].contractAddress;
       nxmToken2Address=allContractVersions[version][10].contractAddress;
       claimsAddress=allContractVersions[version][11].contractAddress;
       claimsRewardAddress=allContractVersions[version][13].contractAddress;
       poolAddress = allContractVersions[version][14].contractAddress;
       governanceAddress = allContractVersions[version][15].contractAddress;
       //13/1/2018
       governance2Address=allContractVersions[version][16].contractAddress;

       fiatFaucetAddress = allContractVersions[version][17].contractAddress;        
       faucetUSDAddress = allContractVersions[version][19].contractAddress;                             
       faucetEURAddress =allContractVersions[version][20].contractAddress;
       faucetGBPAddress = allContractVersions[version][21].contractAddress;
       masters2Address=allContractVersions[version][22].contractAddress;
       mcrAddress =allContractVersions[version][24].contractAddress;
       pool2Address=allContractVersions[version][18].contractAddress;
       pool3Address=allContractVersions[version][25].contractAddress;
       memberAddress=allContractVersions[version][26].contractAddress;
    }
    /// @dev Links all contracts to master.sol by passing address of Master contract to the functions of other contracts.
    function changeMasterAddress(address _add) onlyOwner
    {
        
       qd=quotationData(quoteDataAddress);
       qd.changeMasterAddress(_add);
       q2=quotation2(quotation2Address);
       q2.changeMasterAddress(_add);
       td=nxmTokenData(nxmTokenDataAddress);
       td.changeMasterAddress(_add);

       tc1=nxmToken(nxmTokenAddress);
       tc1.changeMasterAddress(_add);
       
       tc2=nxmToken2(nxmToken2Address);
       tc2.changeMasterAddress(_add);

       cd=claimsData(claimDataAddress);
       cd.changeMasterAddress(_add);

       c1=claims(claimsAddress);
       c1.changeMasterAddress(_add);

       cr=claimsReward(claimsRewardAddress);
       cr.changeMasterAddress(_add);          
       pd=poolData(poolDataAddress);
       pd.changeMasterAddress(_add);

       p1=pool(poolAddress);
       p1.changeMasterAddress(_add);
       gd=governanceData(governanceDataAddress);
       gd.changeMasterAddress(_add);

       g1=governance(governanceAddress);
       g1.changeMasterAddress(_add);

       md=mcrData(mcrDataAddress);
       md.changeMasterAddress(_add);

       m1=mcr(mcrAddress);
       m1.changeMasterAddress(_add);

       f1=fiatFaucet(fiatFaucetAddress);
       f1.changeMasterAddress(_add);

       m2=masters2(masters2Address);
       m2.changeMasterAddress(_add); 

       p2=pool2(pool2Address);
       p2.changeMasterAddress(_add);  
       p3=pool3(pool3Address);
       p3.changeMasterAddress(_add);

       g2=governance2(governance2Address);
       g2.changeMasterAddress(_add);

       mr=memberRoles(memberAddress);
       mr.changeMasterAddress(_add);
    }
    /// @dev Link contracts to one another.
    function changeOtherAddress() onlyInternal
    {
        q2=quotation2(quotation2Address);
        q2.changeTokenAddress(nxmTokenAddress);
        q2.changeToken2Address(nxmToken2Address);
        q2.changePoolAddress(poolAddress);
        q2.changeQuotationDataAddress(quoteDataAddress);
        q2.changeMCRAddress(mcrAddress);
        q2.changeMemberRolesAddress(memberAddress);
        
        tc1=nxmToken(nxmTokenAddress);
        tc1.changeTokenDataAddress(nxmTokenDataAddress);
        tc1.changeToken2Address(nxmToken2Address);
        tc1.changeQuotationDataAddress(quoteDataAddress);
        tc1.changeMCRAddress(mcrAddress);
        tc1.changeMemberRolesAddress(memberAddress);
        
        tc2=nxmToken2(nxmToken2Address);
        tc2.changeTokenDataAddress(nxmTokenDataAddress);
        tc2.changeQuotationDataAddress(quoteDataAddress);
        tc2.changePoolAddress(poolAddress);
        tc2.changeMCRAddress(mcrAddress);
        tc2.changeTokenAddress(nxmTokenAddress);
        tc2.changeMemberRolesAddress(memberAddress);
        
        c1=claims(claimsAddress);
        c1.changeQuotationDataAddress(quoteDataAddress);
        c1.changeTokenAddress(nxmTokenAddress);
        c1.changeToken2Address(nxmToken2Address);
        c1.changeTokenDataAddress(nxmTokenDataAddress);
        c1.changePoolAddress(poolAddress);
        // c1.changePool2Address(pool2Address);
        c1.changePool3Address(pool3Address);
        c1.changePoolDataAddress(poolDataAddress);
        c1.changeClaimRewardAddress(claimsRewardAddress);
        // c1.changeGovernanceAddress(governanceAddress);
        c1.changeClaimDataAddress(claimDataAddress);
        // c1.changeFiatFaucetAddress(fiatFaucetAddress);
        c1.changeMemberRolesAddress(memberAddress);
        
        cr=claimsReward(claimsRewardAddress);
        cr.changeClaimsAddress(claimsAddress);
        cr.changeClaimDataAddress(claimDataAddress);
        cr.changeTokenAddress(nxmTokenAddress);
        cr.changeToken2Address(nxmToken2Address);
        cr.changePoolAddress(poolAddress);
        cr.changePool2Address(pool2Address);
        cr.changePoolDataAddress(poolDataAddress);
        cr.changeQuotationDataAddress(quoteDataAddress);
        
        p1=pool(poolAddress);
        p1.changeTokenAddress(nxmTokenAddress);
        p1.changeFiatFaucetAddress(fiatFaucetAddress);
        p1.changeGovernanceAddress(governanceAddress);
        p1.changePoolAddress(poolAddress);
        p1.changePoolDataAddress(poolDataAddress);
        p1.changeQuotation2Address(quotation2Address);
        p1.changePool2Address(pool2Address);
        p1.changeMemberRolesAddress(memberAddress);
        
        g1=governance(governanceAddress);
        g1.changeAllAddress(nxmTokenAddress,claimsAddress,poolAddress,poolDataAddress,pool3Address);
        g1.changeGovernanceDataAddress(governanceDataAddress);
        g1.changeToken2Address(nxmToken2Address);
        g1.changeTokenDataAddress(nxmTokenDataAddress);
        
        m1=mcr(mcrAddress);
        m1.changeTokenAddress(nxmTokenAddress);
        m1.changePoolAddress(poolAddress);
        m1.changeFiatFaucetAddress(fiatFaucetAddress);
        m1.changeMCRDataAddress(mcrDataAddress);
        m1.changeQuotationDataAddress(quoteDataAddress);
        
        s1=SupplyToken(faucetUSDAddress);
        s1.changePoolAddress(poolAddress);
        s1.changeFiatTokenAddress(fiatFaucetAddress);
        
        s1=SupplyToken(faucetEURAddress);
        s1.changePoolAddress(poolAddress);
        s1.changeFiatTokenAddress(fiatFaucetAddress);
        
        s1=SupplyToken(faucetGBPAddress);
        s1.changePoolAddress(poolAddress);
        s1.changeFiatTokenAddress(fiatFaucetAddress);
        
        f1=fiatFaucet(fiatFaucetAddress);
        f1.changeQuotationAddress(quotation2Address);
        f1.updateCurr(faucetUSDAddress,faucetEURAddress,faucetGBPAddress);
        f1.changeMemberRolesAddress(memberAddress);
        
        m2=masters2(masters2Address);
        m2.changePoolAddress(poolAddress);
        m2.changeClaimsAddress(claimsAddress);
        m2.changeClaimRewardAddress(claimsRewardAddress);
        m2.changeGovernanceAddress(governanceAddress);
        m2.changeClaimDataAddress(claimDataAddress);
        m2.changeMCRAddress(mcrAddress);
        m2.changeQuotationDataAddress(quoteDataAddress);
        m2.changePoolDataAddress(poolDataAddress);
        
        p2=pool2(pool2Address);
        p2.changePool3Address(pool3Address);
        p2.changeTokenAddress(nxmTokenAddress);
        p2.changeToken2Address(nxmToken2Address);
        p2.changeGovernanceAddress(governanceAddress);
        p2.changeClaimRewardAddress(claimsRewardAddress);
        p2.changePoolDataAddress(poolDataAddress);
        p2.changeQuotation2Address(quotation2Address);
        p2.changeQuotationDataAddress(quoteDataAddress);
        p2.changePoolAddress(poolAddress);
        p2.changeClaimAddress(claimsAddress);
        p2.changeFiatFaucetAddress(fiatFaucetAddress);
        p2.changeMCRDataAddress(mcrDataAddress);
        p2.changeMCRAddress(mcrAddress); 
        
        p3=pool3(pool3Address);
        p3.changePoolDataAddress(poolDataAddress);
        p3.changeFiatFaucetAddress(fiatFaucetAddress);
        p3.changePoolAddress(poolAddress);
        p3.changeMCRDataAddress(mcrDataAddress);
        p3.changePool2Address(pool2Address);
        
        g2=governance2(governance2Address);
        g2.changeGovernanceDataAddress(governanceDataAddress);
        g2.changePoolAddress(poolAddress);
    }
    // function changeOtherAddressOfQuotation2() onlyInternal
    // {
    //     q2=quotation2(quotation2Address);
    //     q2.changeTokenAddress(nxmTokenAddress);
    //     q2.changeToken2Address(nxmToken2Address);
    //     q2.changePoolAddress(poolAddress);
    //     q2.changeQuotationDataAddress(quoteDataAddress);
    //     q2.changeMCRAddress(MCRAddress);
    // }
    
    // function changeOtherAddressOfNXMToken() onlyInternal
    // {
    //     tc1=nxmToken(nxmTokenAddress);
    //     tc1.changeTokenDataAddress(tokenDataAddress);
    //     tc1.changeToken2Address(nxmToken2Address);
    //     tc1.changeQuotationDataAddress(quoteDataAddress);
    //     tc1.changeMCRAddress(MCRAddress);
        
    //     tc2=nxmToken2(nxmToken2Address);
    //     tc2.changeTokenDataAddress(tokenDataAddress);
    //     tc2.changeQuotationDataAddress(quoteDataAddress);
    //     tc2.changePoolAddress(poolAddress);
    //     tc2.changeMCRAddress(MCRAddress);
    //     tc2.changeTokenAddress(nxmTokenAddress);
    //     tc2.changeMemberRolesAddress(memberAddress);
    // }
    
    // function changeOtherAddressOfClaims() onlyInternal
    // {
    //     c1=claims(claimsAddress);
    //     c1.changeQuotationDataAddress(quoteDataAddress);
    //     c1.changeTokenAddress(nxmTokenAddress);
    //     c1.changeToken2Address(nxmToken2Address);
    //     c1.changeTokenDataAddress(tokenDataAddress);
    //     c1.changePoolAddress(poolAddress);
    //     c1.changePool2Address(pool2Address);
    //     c1.changePool3Address(pool3Address);
    //     c1.changePoolDataAddress(poolDataAddress);
    //     c1.changeClaimRewardAddress(claims_RewardAddress);
    //     c1.changeGovernanceAddress(governanceAddress);
    //     c1.changeClaimDataAddress(claimDataAddress);
    //     c1.changeFiatFaucetAddress(fiatFaucetAddress);
    // }
    // function changeOtherAddressOfClaimsReward() onlyInternal
    // {
    //     cr=claims_Reward(claims_RewardAddress);
    //     cr.changeClaimsAddress(claimsAddress);
    //     cr.changeClaimDataAddress(claimDataAddress);
    //     cr.changeTokenAddress(nxmTokenAddress);
    //     cr.changeToken2Address(nxmToken2Address);
    //     cr.changePoolAddress(poolAddress);
    //     cr.changePool2Address(pool2Address);
    //     cr.changePoolDataAddress(poolDataAddress);
    //     cr.changeQuotationDataAddress(quoteDataAddress);
    // }
    // function changeOtherAddressOfPool() onlyInternal
    // {
    //     p1=pool(poolAddress);
    //     p1.changeTokenAddress(nxmTokenAddress);
    //     p1.changeFiatFaucetAddress(fiatFaucetAddress);
    //     p1.changeGovernanceAddress(governanceAddress);
    //     p1.changePoolAddress(poolAddress);
    //     p1.changePoolDataAddress(poolDataAddress);
    //     p1.changeQuotation2Address(quotation2Address);
    //     p1.changePool2Address(pool2Address);
        
    //     p2=pool2(pool2Address);
    //     p2.changePool3Address(pool3Address);
    //     p2.changeTokenAddress(nxmTokenAddress);
    //     p2.changeToken2Address(nxmToken2Address);
    //     p2.changeGovernanceAddress(governanceAddress);
    //     p2.changeClaimRewardAddress(claims_RewardAddress);
    //     p2.changePoolDataAddress(poolDataAddress);
    //     p2.changeQuotation2Address(quotation2Address);
    //     p2.changeQuotationDataAddress(quoteDataAddress);
    //     p2.changePoolAddress(poolAddress);
    //     p2.changeClaimAddress(claimsAddress);
    //     p2.changeFiatFaucetAddress(fiatFaucetAddress);
    //     p2.changeMCRDataAddress(mcrDataAddress);
    //     p2.changeMCRAddress(MCRAddress); 
        
    //     p3=pool3(pool3Address);
    //     p3.changePoolDataAddress(poolDataAddress);
    //     p3.changeFiatFaucetAddress(fiatFaucetAddress);
    //     p3.changePoolAddress(poolAddress);
    //     p3.changeMCRDataAddress(mcrDataAddress);
    //     p3.changePool2Address(pool2Address);
        
    // }
    // function changeOtherAddressOfGovernance() onlyInternal
    // {
    //     g1=governance(governanceAddress);
    //     g1.changeAllAddress(nxmTokenAddress,claimsAddress,poolAddress,poolDataAddress,pool3Address);
    //     g1.changeGovernanceDataAddress(governanceDataAddress);
    //     g1.changeToken2Address(nxmToken2Address);
    //     g1.changeTokenDataAddress(tokenDataAddress);
        
    //     g2=governance2(governance2Address);
    //     g2.changeGovernanceDataAddress(governanceDataAddress);
    //     g2.changePoolAddress(poolAddress);
    // }
    // function changeOtherAddressOfMCR() onlyInternal
    // {
    //     m1=MCR(MCRAddress);
    //     m1.changeTokenAddress(nxmTokenAddress);
    //     m1.changePoolAddress(poolAddress);
    //     m1.changeFiatFaucetAddress(fiatFaucetAddress);
    //     m1.changeMCRDataAddress(mcrDataAddress);
    //     m1.changeQuotationDataAddress(quoteDataAddress);
    // }
    // function changeOtherAddressOfSupplyToken() onlyInternal
    // {
    //     s1=SupplyToken(faucetUSDAddress);
    //     s1.changePoolAddress(poolAddress);
    //     s1.changeFiatTokenAddress(fiatFaucetAddress);
        
    //     s1=SupplyToken(faucetEURAddress);
    //     s1.changePoolAddress(poolAddress);
    //     s1.changeFiatTokenAddress(fiatFaucetAddress);
        
    //     s1=SupplyToken(faucetGBPAddress);
    //     s1.changePoolAddress(poolAddress);
    //     s1.changeFiatTokenAddress(fiatFaucetAddress);
    // }
    // function changeOtherAddressOfFiatFaucet() onlyInternal
    // {
    //     f1=fiatFaucet(fiatFaucetAddress);
    //     f1.changeQuotationAddress(quotation2Address);
    //     f1.updateCurr(faucetUSDAddress,faucetEURAddress,faucetGBPAddress);
    // }
    // function changeOtherAddressOfMaster2() onlyInternal
    // {
    //     m2=masters2(masters2Address);
    //     m2.changePoolAddress(poolAddress);
    //     m2.changeClaimsAddress(claimsAddress);
    //     m2.changeClaimRewardAddress(claims_RewardAddress);
    //     m2.changeGovernanceAddress(governanceAddress);
    //     m2.changeClaimDataAddress(claimDataAddress);
    //     m2.changeMCRAddress(MCRAddress); 
    //     m2.changeQuotationDataAddress(quoteDataAddress); 
    //     m2.changePoolDataAddress(poolDataAddress);
    // }
    
    /// @dev Updates the version of contracts and calls the oraclize query to update UI.
    function switchToRecentVersion() onlyInternal
    {
       uint version = SafeMaths.sub(versionLength,1);
       p1=pool(poolAddress);
       p1.versionOraclise(version);
       addInContractChangeDate(now,version);
       changeAddressinMaster(version);
       changeOtherAddress();
    }
    /// @dev Stores the date when version of contracts get switched.
    /// @param _date Current date stamp.
    /// @param vno Active version number to which contracts have been switched.
    function addInContractChangeDate(uint _date , uint vno) internal
    {
       contractChangeDate.push(changeVersion(_date,vno));
    }
    /// @dev Adds Contract's name  and its ethereum address in a given version.
    /// @param vno Version Number.
    /// @param name Contract's Name.
    /// @param _add Contract's address.
    function addContractDetails(uint vno,bytes16 name,address _add) internal
    {
       allContractVersions[vno].push(contractDetails(name,_add));        
    }
    /// @dev Deactivates address of a contract from last version.
    // Sets value 0 for last version of contract address signifying that contract of last version is no longer active.
    // Sets value 1 signifying that contract of recent version is active.
    /// @param version Recent version number.
    /// @param index Index Number of contract whose address will be removed.
    function addRemoveAddress(uint version,uint index) internal
    {
       uint version_old=0;
       if(version>0)
           version_old=SafeMaths.sub(version,1);
       contracts_active[allContractVersions[version_old][index].contractAddress]=false;
       contracts_active[allContractVersions[version][index].contractAddress]=true;
    }
  
    /// @dev Sets the length of version.
    function setVersionLength(uint len) internal
    {
       versionLength = len;
    }
    ///@dev checks whether the address is a latest contract address.
    function isInternal(address _add) constant returns(bool check)
    {
       check=false; // should be 0
       if((contracts_active[_add] == true || owner==_add )) //remove owner for production release
           check=true;
    }

    function isOwner(address _add) constant returns(bool check)
    {
       check=false;
       if(owner == _add)
           check=true;
    }
    
    /// @dev emergency pause function. if check=0 function will execute otherwise not.
    function isPause()constant returns(bool check)
    {
       
       if(emergency_Paused.length>0)
       {
           if(emergency_Paused[SafeMaths.sub(emergency_Paused.length,1)].pause==true)
               return true;
           else
               return false;
       }
        else
           return false; //in emergency pause state
    }
    // function isMember(address _add) constant returns (bool)
    // {
    //     mr = MemberRoles(memberAddress);
    //     return mr.isMember(_add);
    // }
    ///@dev Change owner of the contract.
    function changeOwner(address to) onlyOwner
    {
       if(owner == msg.sender)
            owner = to;
    }
    ///@dev Get emergency pause details by index.
    function getEmergencyPauseByIndex (uint indx) constant returns(uint _indx,bool _pause,uint _time, bytes4 _by) {
        _pause  =emergency_Paused[indx].pause;
        _time   =emergency_Paused[indx].time;
        _by     =emergency_Paused[indx].by;
        _indx   =indx;
    }
    ///@dev Get the number of emergency pause has been toggled.
    function getEmergencyPausedLength () constant returns(uint len) {
        len = emergency_Paused.length;
    }
    ///@dev Get last emergency pause details.
    function getLastEmergencyPause () constant returns(bool _pause,uint _time, bytes4 _by) {
        _pause=false;
        _time=0;
        _by="";
        uint len = getEmergencyPausedLength();
        if(len>0){
            _pause  =emergency_Paused[SafeMaths.sub(len,1)].pause;
            _time    =emergency_Paused[SafeMaths.sub(len,1)].time;
            _by     =emergency_Paused[SafeMaths.sub(len,1)].by;
        }
    }
    
    /// @dev Sets the older version contract address as inactive and the latest one as active.
    /// @param version Latest version number.
    function changeAllAddress1(uint version) onlyInternal
    {
        addRemoveAddress(version,0);
        addRemoveAddress(version,1);
        addRemoveAddress(version,2);
        addRemoveAddress(version,3);
        addRemoveAddress(version,4);
        addRemoveAddress(version,5);
        addRemoveAddress(version,6);
        addRemoveAddress(version,7);
        addRemoveAddress(version,8);
        addRemoveAddress(version,9);
        addRemoveAddress(version,10);
        addRemoveAddress(version,11);
        addRemoveAddress(version,12);
    }
    /// @dev Sets the older version contract address as inactive and the latest one as active.
    /// @param version Latest version number.
    function changeAllAddress2(uint version) onlyInternal
    {
        addRemoveAddress(version,13);
        addRemoveAddress(version,14);
        addRemoveAddress(version,15);
        addRemoveAddress(version,16);
        addRemoveAddress(version,17);
        addRemoveAddress(version,18);
        addRemoveAddress(version,19);
        addRemoveAddress(version,20);
        addRemoveAddress(version,21);
        addRemoveAddress(version,22);
        addRemoveAddress(version,23);
        addRemoveAddress(version,24);
        addRemoveAddress(version,25);
        addRemoveAddress(version,26);
    }
    /// @dev Creates a new version of contract addresses
    /// @param arr Array of addresses of compiled contracts.
    function addNewVersion(address[] arr) onlyOwner
    {
        uint versionNo = versionLength;
        setVersionLength(SafeMaths.add(versionNo,1));
         
        addContractDetails(versionNo,"Masters",masterAddress);
        addContractDetails(versionNo,"QuotationData",arr[0]);
        addContractDetails(versionNo,"TokenData",arr[1]);
        addContractDetails(versionNo,"ClaimData",arr[2]);
        addContractDetails(versionNo,"PoolData",arr[3]);
        addContractDetails(versionNo,"GovernanceData",arr[4]);
        addContractDetails(versionNo,"MCRData",arr[5]);
        addContractDetails(versionNo,"Quotation",arr[6]);
        addContractDetails(versionNo,"Quotation2",arr[7]);
        addContractDetails(versionNo,"NXMToken",arr[8]);
        addContractDetails(versionNo,"NXMToken2",arr[9]);
        addContractDetails(versionNo,"Claims",arr[10]);
        addContractDetails(versionNo,"Claims2",arr[11]);
        addContractDetails(versionNo,"ClaimsReward",arr[12]);
    }
    /// @dev Creates a new version of contract addresses.
    /// @param versionNo Latest version number to which addresses need to be added
    /// @param arr Array of addresses of compiled contracts.
    function addNewVersion2(uint versionNo,address[] arr) onlyOwner
    {
        addContractDetails(versionNo,"Pool",arr[0]);
        addContractDetails(versionNo,"Governance",arr[1]);
        addContractDetails(versionNo,"Governance2",arr[2]);
        addContractDetails(versionNo,"FiatFaucet",arr[3]);
        addContractDetails(versionNo,"Pool2",arr[4]);
        addContractDetails(versionNo,"FaucetUSD",arr[5]);
        addContractDetails(versionNo,"FaucetEUR",arr[6]);
        addContractDetails(versionNo,"FaucetGBP",arr[7]);
        addContractDetails(versionNo,"Masters2",arr[8]);
        addContractDetails(versionNo,"NXMToken3",arr[9]);
        addContractDetails(versionNo,"MCR",arr[10]);
        addContractDetails(versionNo,"Pool3",arr[11]);
        addContractDetails(versionNo,"MemberRoles",arr[12]);
    }
}
