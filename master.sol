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


pragma solidity ^0.4.8;
import "./quotation.sol";
import "./quotation2.sol";
import "./NXMToken.sol";
import "./NXMToken2.sol";
import "./NXMToken3.sol";
import "./claims.sol";
import "./claims2.sol";
import "./claims_Reward.sol";
import "./pool.sol";
import "./governance.sol";
import "./governance2.sol";
import "./fiatFaucet.sol";
import "./MCR.sol";
import "./USD.sol";
import "./master2.sol";
import "./claimsData.sol";
import "./pool2.sol";
import "./quotationData.sol";
import "./NXMTokenData.sol";
import "./poolData1.sol";
import "./MCRData.sol";
import "./governanceData.sol";
import "./master3.sol";

contract master  {

    struct contractDetails{
        bytes16 name;
        address contractAddress;
    }
    struct changeVersion{
        uint date_implement;
        uint versionNo;
    }
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
    address  quotationAddress;
    address  NXMTokenAddress;
    address  claimsAddress;
    address  quotation2Address;
    address  NXMToken2Address;
    address  NXMToken3Address;
    address  claims2Address;
    address  claims_RewardAddress;
    address  poolAddress;
    address  governanceAddress;
    address  governance2Address;
    address  fiatFaucetAddress;
    address  MCRAddress;
    address  faucetUSDAddress;                             
    address  faucetEURAddress;
    address  faucetGBPAddress;
    address  masters2Address;
    address  masterAddress;
    address  pool2Address;
    address master3Address;
   
    claimsData cd1;
    
   
    quotation q1;
    quotation2 q2;
    NXMToken t1;
    NXMToken2 t2;
    NXMToken3 t3;
    claims c1;
    claims2 c2;
    claims_Reward cr1;
    pool p1;
    governance g1;
    governance2 g2;
    fiatFaucet f1;
    MCR m1;
    SupplyToken s1;
    masters2 m2;
    pool2 p2;
    quotationData qd1;
    NXMTokenData td1;
    governanceData gd1;
    poolData1 pd1;
    MCRData md1;
    master3 ms3;
    
    
    
    address public owner;

     modifier onlyOwner{
        
        require(isOwner(msg.sender) == 1);
        _; 
    }
    /// @dev Constructor
    function masterCon(){
        owner=msg.sender;
        contracts_active[masterAddress]=0;
        contracts_active[address(this)]=1;
       
        masterAddress=address(this);
        versionLength =0;
    }

   
   /// @dev Changes all reference contract addresses in master
    function changeAddressinMaster(uint version) onlyInternal
    {
        ms3=master3(allContractVersions[version][25].contractAddress);
        ms3.changeAllAddress1(version);
        ms3.changeAllAddress2(version);
        quoteDataAddress = allContractVersions[version][1].contractAddress;
        tokenDataAddress = allContractVersions[version][2].contractAddress;
        claimDataAddress = allContractVersions[version][3].contractAddress;
        poolDataAddress = allContractVersions[version][4].contractAddress;
        governanceDataAddress = allContractVersions[version][5].contractAddress;
        mcrDataAddress = allContractVersions[version][6].contractAddress;        
        quotationAddress=allContractVersions[version][7].contractAddress;
        quotation2Address = allContractVersions[version][8].contractAddress;
        NXMTokenAddress=allContractVersions[version][9].contractAddress;
        NXMToken2Address=allContractVersions[version][10].contractAddress;
        claimsAddress=allContractVersions[version][11].contractAddress;
        claims2Address=allContractVersions[version][12].contractAddress;        
        claims_RewardAddress=allContractVersions[version][13].contractAddress;
        poolAddress = allContractVersions[version][14].contractAddress;
        governanceAddress = allContractVersions[version][15].contractAddress;
        governance2Address=allContractVersions[version][16].contractAddress;
        fiatFaucetAddress = allContractVersions[version][17].contractAddress;        
        pool2Address=allContractVersions[version][18].contractAddress;
        faucetUSDAddress = allContractVersions[version][19].contractAddress;                             
        faucetEURAddress =allContractVersions[version][20].contractAddress;
        faucetGBPAddress = allContractVersions[version][21].contractAddress;
        masters2Address=allContractVersions[version][22].contractAddress;
        NXMToken3Address=allContractVersions[version][23].contractAddress;
        MCRAddress =allContractVersions[version][24].contractAddress;
        master3Address= allContractVersions[version][25].contractAddress;
    }
    /// @dev Links all contracts to master.sol by passing address of Master contract to the functions of other contracts.
    function changeMasterAddress(address _add) onlyOwner
    {
        
        qd1=quotationData(quoteDataAddress);
        qd1.changeMasterAddress(_add);

        q1=quotation(quotationAddress);
        q1.changeMasterAddress(_add);

        q2=quotation2(quotation2Address);
        q2.changeMasterAddress(_add);

        td1=NXMTokenData(tokenDataAddress);
        td1.changeMasterAddress(_add);

        t1=NXMToken(NXMTokenAddress);
        t1.changeMasterAddress(_add);

        t2=NXMToken2(NXMToken2Address);
        t2.changeMasterAddress(_add);

        t3=NXMToken3(NXMToken3Address);
        t3.changeMasterAddress(_add);

        cd1=claimsData(claimDataAddress);
        cd1.changeMasterAddress(_add);

        c1=claims(claimsAddress);
        c1.changeMasterAddress(_add);

        c2=claims2(claims2Address);
        c2.changeMasterAddress(_add);

        cr1=claims_Reward(claims_RewardAddress);
        cr1.changeMasterAddress(_add);          

        pd1=poolData1(poolDataAddress);
        pd1.changeMasterAddress(_add);

        p1=pool(poolAddress);
        p1.changeMasterAddress(_add);

        p2=pool2(pool2Address);
        p2.changeMasterAddress(_add);

        gd1=governanceData(governanceDataAddress);
        gd1.changeMasterAddress(_add);

        g1=governance(governanceAddress);
        g1.changeMasterAddress(_add);

        g2=governance2(governance2Address);
        g2.changeMasterAddress(_add);

        md1=MCRData(mcrDataAddress);
        md1.changeMasterAddress(_add);

        m1=MCR(MCRAddress);
        m1.changeMasterAddress(_add);

        f1=fiatFaucet(fiatFaucetAddress);
        f1.changeMasterAddress(_add);

        m2=masters2(masters2Address);
        m2.changeMasterAddress(_add); 

        ms3=master3(master3Address);
        ms3.changeMasterAddress(_add);  

    }
    /// @dev Link contracts to one another.
   function changeOtherAddress(uint version) onlyInternal
   {   
        q1=quotation(quotationAddress);       
        q1.changeToken2Address(NXMToken2Address);        
        q1.changeQuotation2Address(quotation2Address);

        q2=quotation2(quotation2Address);
        q2.changeQuotationAddress(quotationAddress);
        q2.changeTokenAddress(NXMTokenAddress);
        q2.changePoolAddress(poolAddress);
        q2.changeQuotationDataAddress(quoteDataAddress);
        q2.changeMCRAddress(MCRAddress);
        q2.changeToken2Address(NXMToken2Address);
        
        

        t1=NXMToken(NXMTokenAddress);
        t1.changeToken2Address(NXMToken2Address);
        t1.changeToken3Address(NXMToken3Address);
        t1.changeQuoteAddress(quotationAddress);
        t1.changeMCRAddress(MCRAddress);
        t1.changeTokenDataAddress(tokenDataAddress);
        

        t2=NXMToken2(NXMToken2Address);        
        t2.changeTokenAddress(NXMTokenAddress);
        t2.changePoolAddress(poolAddress);
        t2.changeToken3Address(NXMToken3Address);

        t3=NXMToken3(NXMToken3Address);       
        t3.changePoolAddress(poolAddress);

        c2=claims2(claims2Address);
        c2.changeClaimAddress(claimsAddress);
        c2.changeTokenAddress(NXMTokenAddress);
        c2.changeQuotationAddress(quotationAddress);
        c2.changeClaimRewardAddress(claims_RewardAddress);
        c2.changePoolAddress(poolAddress);
        
        c2.changeClaimDataAddress(claimDataAddress);
        c2.changeToken2Address(NXMToken2Address);

        c1=claims(claimsAddress);
        // c1.changeTokenAddress(NXMTokenAddress);
        // c1.changeQuotationAddress(quotationAddress);
        c1.changeClaimRewardAddress(claims_RewardAddress);
        c1.changePoolAddress(poolAddress);
        c1.changeGovernanceAddress(governanceAddress);
        c1.changeClaimDataAddress(claimDataAddress);
        c1.changeToken2Address(NXMToken2Address);
        c1.changeTokenDataAddress(tokenDataAddress);

        
        
        cr1=claims_Reward(claims_RewardAddress);
        cr1.changeTokenAddress(NXMTokenAddress);
        cr1.changeQuotationAddress(quotationAddress);
        cr1.changeClaimsAddress(claimsAddress);
        cr1.changePool2Address(pool2Address);
        cr1.changeToken2Address(NXMToken2Address);
         cr1.changeClaimDataAddress(claimDataAddress);
         cr1.changeToken3Address(NXMToken3Address);

        p1=pool(poolAddress);
        p1.changeTokenAddress(NXMTokenAddress);
        p1.changeQuoteAddress(quotationAddress);
        p1.changeClaimAddress(claimsAddress);
        p1.changeFiatFaucetAddress(fiatFaucetAddress);
        p1.changeGovernanceAddress(governanceAddress);
        p1.changePoolAddress(poolAddress);
        p1.changeClaimRewardAddress(claims_RewardAddress);
        p1.changePoolDataAddress(poolDataAddress);
        p1.changeQuotation2Address(quotation2Address);
       
        p1.changePool2Address(pool2Address);

        p2=pool2(pool2Address);        
        p2.changeQuoteAddress(quotationAddress); 
        p2.changeGovernanceAddress(governanceAddress);
        p2.changeClaimRewardAddress(claims_RewardAddress);
        p2.changePoolDataAddress(poolDataAddress);
        p2.changeQuotation2Address(quotation2Address);
        p2.changePoolAddress(poolAddress);
        p2.changeTokenAddress(NXMTokenAddress);
        p2.changeClaimAddress(claimsAddress);
        p2.changeFiatFaucetAddress(fiatFaucetAddress);
        p2.changeMCRAddress(MCRAddress);

        g1=governance(governanceAddress);
        g1.changeAllAddress(NXMTokenAddress,claimsAddress,poolAddress);
        g1.changeGovernanceDataAddress(governanceDataAddress);
        g1.changeToken2Address(NXMToken2Address);
        g1.changeTokenDataAddress(tokenDataAddress);

        g2=governance2(governance2Address);
        g2.changeGovernanceDataAddress(governanceDataAddress);

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
        f1.changeQuotationAddress(quotationAddress);
        f1.changeTokenAddress(NXMTokenAddress);
        f1.updateCurr(faucetUSDAddress,faucetEURAddress,faucetGBPAddress);
        
        m2=masters2(masters2Address);
        m2.changePoolAddress(poolAddress);
        m2.changeClaimsAddress(claimsAddress);
        m2.changeClaimRewardAddress(claims_RewardAddress);
        m2.changeGovernanceAddress(governanceAddress);
        m2.changeClaimDataAddress(claimDataAddress);
        m2.changeMCRAddress(MCRAddress);   
   }
    /// @dev Updates the version of contracts and calls the oraclize query to update UI.
    function switchToRecentVersion() onlyInternal
    {
        uint version = versionLength-1;
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
    function addContractDetails(uint vno,bytes16 name,address _add) 
    {
        allContractVersions[vno].push(contractDetails(name,_add));        
    }
    /// @dev Deactivates address of a contract from last version.
    /// Sets value 0 for last version of contract address signifying that contract of last version is no longer active.
    /// Sets value 1 signifying that contract of recent version is active.
    /// @param version Recent version number.
    /// @param index Index Number of contract whose address will be removed.
    function addRemoveAddress(uint version,uint index) 
    {
        uint version_old=0;
        if(version>0)
            version_old=version-1;
        contracts_active[allContractVersions[version_old][index].contractAddress]=0;
        contracts_active[allContractVersions[version][index].contractAddress]=1;
    }
  
   /// @dev Sets the length of version.
    function setVersionLength(uint len) 
    {
        versionLength = len;
    }
    function isInternal(address _add) constant returns(uint check)
    {
        check=0;
        if(contracts_active[_add] == 1 || owner==msg.sender)
            check=1;
    }
    function isOwner(address _add) constant returns(uint check)
    {
        check=0;
        if(owner == _add)
            check=1;
    }
    modifier onlyInternal {
        require(contracts_active[msg.sender] == 1 || owner==msg.sender);
        _; 
    }
    
    
    function changeOwner(address to) onlyOwner
    {
        if(owner == msg.sender)
            owner = to;
    }
    
}
