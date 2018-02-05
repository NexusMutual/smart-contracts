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


pragma solidity 0.4.11;
import "./quotation2.sol";
import "./NXMToken.sol";
import "./NXMToken2.sol";
import "./claims.sol";
import "./claims_Reward.sol";
import "./pool.sol";
import "./governance.sol";
import "./fiatFaucet.sol";
import "./MCR.sol";
import "./USD.sol";
import "./master2.sol";
import "./claimsData.sol";
import "./quotationData.sol";
import "./NXMTokenData.sol";
import "./poolData1.sol";
import "./MCRData.sol";
import "./governanceData.sol";
import "./pool2.sol";
import "./SafeMaths.sol";
import "./pool3.sol";
import "./governance2.sol";
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
    mapping(address=>uint) contracts_active;
        
    address  quoteDataAddress;
    address  tokenDataAddress;
    address  claimDataAddress;
    address  poolDataAddress;
    address  governanceDataAddress;
    address  mcrDataAddress;
    address  NXMTokenAddress;
    address  claimsAddress;
    address  quotation2Address;
    address  NXMToken2Address;
    address  claims_RewardAddress;
    address  poolAddress;
    address  governanceAddress;
    address  fiatFaucetAddress;
    address  MCRAddress;
    address  faucetUSDAddress;                             
    address  faucetEURAddress;
    address  faucetGBPAddress;
    address  masters2Address;
    address  masterAddress;
    address pool2Address;
    address governance2Address;
    claimsData cd1;
    //date 21/11/2017
    address zeroExExchangeAddress;
    address pool3Address;
    //quotation q1;
    quotation2 q2;
    NXMToken t1;
    NXMToken2 t2;
    //NXMToken3 t3;
    claims c1;
    //claims2 c2;
    claims_Reward cr1;
    pool p1;
    governance g1;
    governance2 g2;
    fiatFaucet f1;
    MCR m1;
    SupplyToken s1;
    masters2 m2;
    quotationData qd1;
    NXMTokenData td1;
    governanceData gd1;
    poolData1 pd1;
    MCRData md1;
    //master3 ms3;
    pool2 p2;
    pool3 p3;
    
    address public owner;
    // uint8 public emergencyPaused;
    uint pauseTime;
    modifier onlyOwner
    {  
        require(isOwner(msg.sender) == 1);
        _; 
    }
    modifier onlyInternal {
        require( (contracts_active[msg.sender] == 1 || owner==msg.sender)); //&& emergencyPaused==0
        _; 
    }
    modifier checkPause { 
        require(isPause()==0);
        _; 
    }
    
    /// @dev Constructor
    function master()
    {
        owner=msg.sender;
        contracts_active[masterAddress]=0;
        contracts_active[address(this)]=1;
        masterAddress=address(this);
        versionLength =0;
        // emergencyPaused=0; // initially set false
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
            c1=claims(claimsAddress);
            c1.submitClaimAfterEPOff();     //Submitting Requested Claims.
            cr1=claims_Reward(claims_RewardAddress);
            cr1.StartAllPendingClaimsVoting();   //Start Voting of pending Claims again.
        }
    }
   function updatePauseTime(uint _time) onlyInternal
   {
        pauseTime=_time;
   }
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
        tokenDataAddress = allContractVersions[version][2].contractAddress;
        claimDataAddress = allContractVersions[version][3].contractAddress;
        poolDataAddress = allContractVersions[version][4].contractAddress;
        governanceDataAddress = allContractVersions[version][5].contractAddress;
        mcrDataAddress = allContractVersions[version][6].contractAddress;        
        quotation2Address = allContractVersions[version][8].contractAddress;
        NXMTokenAddress=allContractVersions[version][9].contractAddress;
        NXMToken2Address=allContractVersions[version][10].contractAddress;
        claimsAddress=allContractVersions[version][11].contractAddress;
        claims_RewardAddress=allContractVersions[version][13].contractAddress;
        poolAddress = allContractVersions[version][14].contractAddress;
        governanceAddress = allContractVersions[version][15].contractAddress;
        //13/1/2018
        governance2Address=allContractVersions[version][16].contractAddress;

        fiatFaucetAddress = allContractVersions[version][17].contractAddress;        
        faucetUSDAddress = allContractVersions[version][19].contractAddress;                             
        faucetEURAddress =allContractVersions[version][20].contractAddress;
        faucetGBPAddress = allContractVersions[version][21].contractAddress;
        masters2Address=allContractVersions[version][22].contractAddress;
        MCRAddress =allContractVersions[version][24].contractAddress;
        pool2Address=allContractVersions[version][18].contractAddress;
        pool3Address=allContractVersions[version][25].contractAddress;
    }
    /// @dev Links all contracts to master.sol by passing address of Master contract to the functions of other contracts.
    function changeMasterAddress(address _add) onlyOwner
    {
        
        qd1=quotationData(quoteDataAddress);
        qd1.changeMasterAddress(_add);

        q2=quotation2(quotation2Address);
        q2.changeMasterAddress(_add);

        td1=NXMTokenData(tokenDataAddress);
        td1.changeMasterAddress(_add);

        t1=NXMToken(NXMTokenAddress);
        t1.changeMasterAddress(_add);

        t2=NXMToken2(NXMToken2Address);
        t2.changeMasterAddress(_add);

        cd1=claimsData(claimDataAddress);
        cd1.changeMasterAddress(_add);

        c1=claims(claimsAddress);
        c1.changeMasterAddress(_add);

        cr1=claims_Reward(claims_RewardAddress);
        cr1.changeMasterAddress(_add);          

        pd1=poolData1(poolDataAddress);
        pd1.changeMasterAddress(_add);

        p1=pool(poolAddress);
        p1.changeMasterAddress(_add);

        gd1=governanceData(governanceDataAddress);
        gd1.changeMasterAddress(_add);

        g1=governance(governanceAddress);
        g1.changeMasterAddress(_add);

        md1=MCRData(mcrDataAddress);
        md1.changeMasterAddress(_add);

        m1=MCR(MCRAddress);
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

    }
    /// @dev Link contracts to one another.
   function changeOtherAddress(uint version) onlyInternal
   {   
        
        q2=quotation2(quotation2Address);
        q2.changeTokenAddress(NXMTokenAddress);
        q2.changePoolAddress(poolAddress);
        q2.changeQuotationDataAddress(quoteDataAddress);
        q2.changeMCRAddress(MCRAddress);
        q2.changeToken2Address(NXMToken2Address);
        
        

        t1=NXMToken(NXMTokenAddress);
        t1.changeToken2Address(NXMToken2Address);
        t1.changeQuoteAddress(quotation2Address);
        t1.changeMCRAddress(MCRAddress);
        t1.changeTokenDataAddress(tokenDataAddress);
        

        t2=NXMToken2(NXMToken2Address);        
        t2.changeTokenAddress(NXMTokenAddress);
        t2.changePoolAddress(poolAddress);
        t2.changeQuotationDataAddress(quoteDataAddress);

        c1=claims(claimsAddress);
        c1.changeTokenAddress(NXMTokenAddress);
        c1.changeQuotationAddress(quotation2Address);
        c1.changeClaimRewardAddress(claims_RewardAddress);
        c1.changePoolAddress(poolAddress);
        c1.changeGovernanceAddress(governanceAddress);
        c1.changeClaimDataAddress(claimDataAddress);
        c1.changeToken2Address(NXMToken2Address);
        c1.changeTokenDataAddress(tokenDataAddress);
        c1.changeFiatFaucetAddress(fiatFaucetAddress);
        c1.changeMCRDataAddress(mcrDataAddress);
        c1.changePoolDataAddress(poolDataAddress);
        c1.changePool2Address(pool2Address);
        c1.changePool3Address(pool3Address);

        cr1=claims_Reward(claims_RewardAddress);
        cr1.changeTokenAddress(NXMTokenAddress);
        cr1.changeQuotationAddress(quotation2Address);
        cr1.changeClaimsAddress(claimsAddress);
        cr1.changePoolAddress(poolAddress);
        cr1.changeToken2Address(NXMToken2Address);
        cr1.changeClaimDataAddress(claimDataAddress);
        cr1.changePool2Address(pool2Address);
        cr1.changePoolDataAddress(poolDataAddress);
        cr1.changeTokenDataAddress(tokenDataAddress);
        
        p1=pool(poolAddress);
        p1.changeTokenAddress(NXMTokenAddress);
        p1.changeClaimAddress(claimsAddress);
        p1.changeFiatFaucetAddress(fiatFaucetAddress);
        p1.changeGovernanceAddress(governanceAddress);
        p1.changePoolAddress(poolAddress);
        p1.changeClaimRewardAddress(claims_RewardAddress);
        p1.changePoolDataAddress(poolDataAddress);
        p1.changeQuotation2Address(quotation2Address);
        p1.changeMCRAddress(MCRAddress);
        p1.changePool2Address(pool2Address);

        g1=governance(governanceAddress);
        g1.changeAllAddress(NXMTokenAddress,claimsAddress,poolAddress,poolDataAddress,pool3Address);
        g1.changeGovernanceDataAddress(governanceDataAddress);
        g1.changeToken2Address(NXMToken2Address);
        g1.changeTokenDataAddress(tokenDataAddress);
        
        m1=MCR(MCRAddress);
        m1.changeTokenAddress(NXMTokenAddress);
        m1.changePoolAddress(poolAddress);
        m1.changeFiatFaucetAddress(fiatFaucetAddress);
        m1.changeMCRDataAddress(mcrDataAddress);
        m1.changeToken2Address(NXMToken2Address);
        m1.changeTokenDataAddress(tokenDataAddress);
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
        f1.changeTokenAddress(NXMTokenAddress);
        f1.updateCurr(faucetUSDAddress,faucetEURAddress,faucetGBPAddress);
        
        m2=masters2(masters2Address);
        m2.changePoolAddress(poolAddress);
        m2.changeClaimsAddress(claimsAddress);
        m2.changeClaimRewardAddress(claims_RewardAddress);
        m2.changeGovernanceAddress(governanceAddress);
        m2.changeClaimDataAddress(claimDataAddress);
        m2.changeMCRAddress(MCRAddress); 
        m2.changeQuotationDataAddress(quoteDataAddress); 
        m2.changePoolDataAddress(poolDataAddress); //add in new version

        p2=pool2(pool2Address);   
        p2.changePool3Address(pool3Address);
        p2.changeGovernanceAddress(governanceAddress);
        p2.changeClaimRewardAddress(claims_RewardAddress);
        p2.changePoolDataAddress(poolDataAddress);
        p2.changeQuotation2Address(quotation2Address);
        p2.changePoolAddress(poolAddress);
        p2.changeTokenAddress(NXMTokenAddress);
        p2.changeClaimAddress(claimsAddress);
        p2.changeFiatFaucetAddress(fiatFaucetAddress);
        p2.changeMCRAddress(MCRAddress); 
        p2.changeMCRDataAddress(mcrDataAddress);        

         p3=pool3(pool3Address);
         p3.changePoolDataAddress(poolDataAddress);
         p3.changeFiatFaucetAddress(fiatFaucetAddress);
         p3.changePoolAddress(poolAddress);
         p3.changeMCRDataAddress(mcrDataAddress);
         p3.changePool2Address(pool2Address);

        g2=governance2(governance2Address);
        g2.changeGovernanceDataAddress(governanceDataAddress);
        g2.changePoolAddress(poolAddress);
        //g2.changeGovernanceAddress(governanceAddress);
   }
    /// @dev Updates the version of contracts and calls the oraclize query to update UI.
    function switchToRecentVersion() onlyInternal
    {
        uint version = SafeMaths.sub(versionLength,1);
        p1=pool(poolAddress);
        p1.versionOraclise(version);
        addInContractChangeDate(now,version);
        changeAddressinMaster(version);
        changeOtherAddress(version);
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
        contracts_active[allContractVersions[version_old][index].contractAddress]=0;
        contracts_active[allContractVersions[version][index].contractAddress]=1;
    }
  
   /// @dev Sets the length of version.
    function setVersionLength(uint len) internal
    {
        versionLength = len;
    }
    function isInternal(address _add) constant returns(uint check)
    {
        check=0; // should be 0
        if((contracts_active[_add] == 1 || owner==_add )) //&& emergency_Paused[emergency_Paused.length-1]==0
            check=1;
    }
    function isOwner(address _add) constant returns(uint check)
    {
        check=0;
        if(owner == _add)
            check=1;
    }
    
    /// @dev emergency pause function. if check=0 function will execute otherwise not.
    function isPause()constant returns(uint check)
    {
       
        if(emergency_Paused.length>0)
        {
            if(emergency_Paused[SafeMaths.sub(emergency_Paused.length,1)].pause==true)
                return 1;
            else
                return 0;
        }
         else
            return 0; //in emergency pause state
    }
    function changeOwner(address to) onlyOwner
    {
        if(owner == msg.sender)
            owner = to;
    }
    function getEmergencyPauseByIndex (uint indx) constant returns(uint _indx,bool _pause,uint _time, bytes4 _by) {
        _pause  =emergency_Paused[indx].pause;
        _time   =emergency_Paused[indx].time;
        _by     =emergency_Paused[indx].by;
        _indx   =indx;
    }
    
    function getEmergencyPausedLength () constant returns(uint len) {
        len = emergency_Paused.length;
    }
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
    //master3
     /// @dev Sets the older version contract address as inactive and the latest one as active.
   /// @param version Latest version number.
  function changeAllAddress1(uint version) onlyInternal
    {
        //ms1=master(masterAddress);
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
        //ms1=master(masterAddress);
        
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

    }
    /// @dev Creates a new version of contract addresses
    /// @param arr Array of addresses of compiled contracts.
    function addNewVersion(address[] arr) onlyOwner
    {
       //ms1=master(masterAddress);
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
       //ms1=master(masterAddress);
       
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
       // addContractDetails(versionNo,"Master3",arr[11]);
        addContractDetails(versionNo,"Pool3",arr[11]);
    }
}
