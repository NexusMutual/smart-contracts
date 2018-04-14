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
import "./NXMTokenData.sol";
// import "./quotation2.sol";
import "./quotationData.sol";
import "./pool.sol";
import "./MCR.sol";
import "./NXMToken.sol";
import "./master.sol";
import "./SafeMaths.sol";
import "./MemberRoles.sol";
contract NXMToken2{
        using SafeMaths for uint;

    master ms;
    // quotation2 q1;
    quotationData qd;
    NXMTokenData td;
    pool p1;
    MCR m1;
    NXMToken tc1;
    MemberRoles mr;
    
    uint64 private constant _DECIMAL_1e18 = 1000000000000000000;
    uint40 private constant _DECIMAL_1e10 = 10000000000;
    
    address tokenAddress;
    address quotationDataAddress;
    // address quotation2Address;
    address tokenDataAddress;
    address poolAddress;
    address mcrAddress;
    address memberAddress;
    address masterAddress;
    
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
    modifier onlyInternal {
        ms=master(masterAddress);
        require(ms.isInternal(msg.sender) == 1);
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
    function changeTokenAddress(address _add) onlyInternal
    {
        tokenAddress = _add;
        tc1=NXMToken(tokenAddress);
    } 
    function changeQuotationDataAddress(address _add) onlyInternal
    {
        quotationDataAddress = _add;
        qd=quotationData(quotationDataAddress);
    } 
    // function changeQuotationAddress(address _add) onlyInternal
    // {
    //     quotation2Address = _add;
    //     q1=quotation2(quotation2Address);
    // }
    
    function changeTokenDataAddress(address _add) onlyInternal
    {
        tokenDataAddress = _add;
        td=NXMTokenData(tokenDataAddress);
    }
    function changePoolAddress(address _add) onlyInternal
    {
        poolAddress = _add;
        p1=pool(poolAddress);
    }
    function changeMCRAddress(address _add) onlyInternal
    {
        mcrAddress = _add;
        m1=MCR(mcrAddress);
    }
    function changeMemberRolesAddress(address _add) onlyInternal
    {
       memberAddress = _add;
       mr=MemberRoles(memberAddress);
    }
    
    /// @dev Locks tokens against a cover.     
    /// @param premiumNxm Premium in NXM of cover.
    /// @param CoverPeriod Cover Period of cover.
    /// @param CoverId Cover id of a cover.
    /// @param senderAddress Quotation owner's Ethereum address.
    /// @return amount Number of tokens that are locked
    function lockCN ( uint premiumNxm,  uint16 CoverPeriod, uint CoverId, address senderAddress) onlyInternal returns(uint amount)
    {
        td=NXMTokenData(tokenDataAddress);

        uint pastlocked;
        (,pastlocked) = td.getUser_cover_lockedCN(senderAddress,CoverId);
        
        if(pastlocked !=0)
            throw;
     
        amount = SafeMaths.div(SafeMaths.mul(premiumNxm,5),100);
        rewardToken(senderAddress,amount);
        //td.changeBalanceOf(senderAddress,SafeMaths.add(td.getBalanceOf(senderAddress),amount));  

        // Updates the number of Supply Tokens and Pool fund value of a currency.
        //td.changeTotalSupply(SafeMaths.add(td.getTotalSupply() , amount)); 
        uint ld=SafeMaths.add(SafeMaths.add(now,td.LockTokenTimeAfterCoverExp()), uint(CoverPeriod)*1 days);
        td.pushInUser_cover_lockedCN(senderAddress,CoverId,ld,amount);
        //tc1=NXMToken(tokenAddress);
        //tc1.callTransferEvent(0,senderAddress,amount); 
    }

    /// @dev Burns tokens used for fraudulent voting against a claim
    /// @param claimid Claim Id.
    /// @param _value number of tokens to be burned
    /// @param _to User's address.
    function burnCAToken(uint claimid , uint _value , address _to) onlyInternal {
         
        td=NXMTokenData(tokenDataAddress);
        // tc1=NXMToken(tokenAddress);
        if( td.getBalanceCAWithAddress(_to) < _value)throw;
        td.pushInBurnCAToken(_to,claimid,now,_value);

        // if(td.getBalanceOf(_to)==0)
        //     td.decMemberCounter();
        
        uint yetToBurned = _value;
        uint times_locked_token=td.getLockedCALength(_to);
        uint vUpto;
        uint amount;
        // Unlock tokens before burning
        for(uint i=0 ; i < times_locked_token ;i++ )
        {
            (vUpto,amount) = td.getLockedCAByindex(_to , i);
            if(now<vUpto)
            {
                if(yetToBurned > amount)
                {
                    yetToBurned = SafeMaths.sub(yetToBurned,amount);
                    td.changeLockedCAByIndex(_to,i,0);
                }
                else
                {
                    td.changeLockedCAByIndex(_to,i,SafeMaths.sub(amount,yetToBurned));
                    yetToBurned=0;
                    break;
                }
            }
        }
        //Change overall member token balance
        // td.changeBalanceOf(_to,SafeMaths.sub(td.getBalanceOf(_to) , _value)); 
        // // Change total supply of NXM Tokens
        // tc1.callBurnEvent(_to,"BurnCA",claimid,_value);
        // // td.changeCurrencyTokens("ETH",SafeMaths.sub(td.getCurrencyTokens("ETH"),_value));
        // td.changeTotalSupply(SafeMaths.sub(td.getTotalSupply() , _value));
        // tc1.callTransferEvent(_to, 0, _value); // notify of the event
        burnLockedToken_extended(_to, claimid,_value,"BurnCA");
    }
    /// @dev Allocates tokens against a given address
    /// @param _to User's address.
    /// @param amount Number of tokens rewarded.
    function rewardToken(address _to,uint amount)  onlyInternal  {
        ms=master(masterAddress);
        require(ms.isMember(_to)==true);
        td = NXMTokenData(tokenDataAddress);
        //Add new member where applicable
        // if(td.getBalanceOf(_to) == 0)
        //     td.incMemberCounter();
        // Change total supply and individual balance of user
        td.changeBalanceOf(_to, SafeMaths.add(td.getBalanceOf(_to) , amount));// mint new tokens
        td.changeTotalSupply(SafeMaths.add(td.getTotalSupply(),amount)); // track the supply
        // td.changeCurrencyTokens("ETH" , SafeMaths.add(td.getCurrencyTokens("ETH") , amount));
        // if(td.checkInallMemberArray(_to)==0)
        // {
        //     td.addInAllMemberArray(_to);
        // }
      
        tc1=NXMToken(tokenAddress);
        tc1.callTransferEvent(0,_to,amount); 
    }
       
    /// @dev Extends validity period of a given number of tokens, locked for Claim Assessment
    /// @param _to  User's address.
    /// @param _timestamp Timestamp for which tokens will be extended.
    /// @param noOfTokens Number of tokens that will get extended. Should be less than or equal to the number of tokens of selected bond. 
    function extendCAWithAddress(address _to ,uint _timestamp ,uint noOfTokens) onlyInternal
    {
        td=NXMTokenData(tokenDataAddress);
        // tc1=NXMToken(tokenAddress);
        noOfTokens = SafeMaths.mul(noOfTokens, _DECIMAL_1e10);
        if(td.getBalanceCAWithAddress(_to) < noOfTokens)throw;
        
        uint yet_to_extend = noOfTokens;
        uint len = td.getLockedCALength(_to);
        uint vUpto;
        uint amount;
        for(uint i=0 ; i < len ;i++ )
        {
            (vUpto , amount) = td.getLockedCAByindex(_to , i);
            if(amount>0 && vUpto > now)
            {
                if(yet_to_extend > amount)
                {
                    yet_to_extend = SafeMaths.sub(yet_to_extend,amount);
                    td.lockCA(_to,SafeMaths.add(vUpto , _timestamp),amount);
                    td.changeLockedCAByIndex(_to,i,0);
                }
                else
                {
                    td.lockCA(_to,SafeMaths.add(vUpto , _timestamp),yet_to_extend);
                    td.changeLockedCAByIndex(_to,i,SafeMaths.sub(amount,yet_to_extend));
                    yet_to_extend=0;
                    break;
                }
            }
        }
    }
    
    
    /// @dev Burns tokens deposited against a cover, called when a claim submitted against this cover is denied.
    /// @param coverid Cover Id.
    function burnCNToken(uint coverid) onlyInternal {
        
        td=NXMTokenData(tokenDataAddress);
        qd=quotationData(quotationDataAddress);
        // uint quoteId = qd.getCoverQuoteid(coverid);
        // bytes4 curr= qd.getCoverCurrency(coverid);
        address _to = qd.getCoverMemberAddress(coverid);
        uint depositedTokens = td.getDepositCN(coverid,_to);
        if(depositedTokens <= 0)throw;
        //Undeposit all tokens locked against the cover
        undepositCN(coverid,1);
        uint validity;
        uint locked_tokens;
        (validity,locked_tokens) = td.getUser_cover_lockedCN(_to,coverid);
        uint len = td.getLockedCNLength(_to);
        uint vUpto;
        uint amount;
        for(uint i=0;i<len ;i++)
        {
            (vUpto,amount) = td.getLockedCNByindex(_to,i);
            if(vUpto == validity && amount == locked_tokens )
            {
                td.updateLockedCN(_to,i,vUpto,SafeMaths.sub(amount,depositedTokens));
                break;
            }
        }
        // tc1=NXMToken(tokenAddress);
        td.updateUser_cover_lockedCN(_to,coverid,validity,SafeMaths.sub(locked_tokens,depositedTokens));
        // tc1.callBurnEvent(_to,"Burn", coverid,depositedTokens);
        // // td.changeCurrencyTokens(curr,SafeMaths.sub(td.getCurrencyTokens(curr) , depositedTokens));
        // // Update NXM token balance against member address and remove member in case overall balance=0
        // td.changeBalanceOf(_to,SafeMaths.sub(td.getBalanceOf(_to) , depositedTokens));
        // // if(td.getBalanceOf(_to)==0)
        // //     td.decMemberCounter();
        // td.changeTotalSupply(SafeMaths.sub(td.getTotalSupply() , depositedTokens));
        
        // tc1.callTransferEvent(_to, 0, depositedTokens); // notify of the event
        burnLockedToken_extended(_to, coverid,depositedTokens,"Burn");
    }
    /// @dev Deposits locked tokens against a given cover id, called whenever a claim is submitted against a coverid
    /// @param coverid Cover Id.
    /// @param _value number of tokens to deposit.
    /// @param _days Validity of tokens.
    /// @param _to User's address.
    function depositCN(uint coverid,uint _value,uint _days,address _to) onlyInternal
    {
        td=NXMTokenData(tokenDataAddress);
        uint amount;
        (,amount) = td.getUser_cover_lockedCN(_to,coverid);
        if (SafeMaths.sub(amount , td.getDepositCN(coverid,msg.sender)) < _value) throw;           // Check if the sender has enough tokens to deposit
        if (_value<=0) throw;
        td.pushInUser_cover_depositCN(_to,coverid,_days,_value);
    }
    /// @dev Extends validity period of a given number of tokens locked for claims assessment.
    /// @param index  index of exisiting bond.
    /// @param _days number of days for which tokens will be extended.
    /// @param noOfTokens Number of tokens that will get extended. Should be less than or equal to the no.of tokens of selected bond.
    function extendCA(uint index , uint _days ,uint noOfTokens) isMemberAndcheckPause
    {
        td=NXMTokenData(tokenDataAddress);
        uint vUpto;
        uint amount;
        (vUpto,amount) = td.getLockedCAByindex(msg.sender,index);
        if(vUpto <now || amount < noOfTokens )throw;
        td.changeLockedCAByIndex(msg.sender,index,SafeMaths.sub(amount,noOfTokens));
        td.lockCA(msg.sender,(SafeMaths.add(vUpto ,SafeMaths.mul( _days, 1 days ))),noOfTokens);
               
    }
    /// @dev Unlocks tokens deposited against a cover.Changes the validity timestamp of deposit tokens.
    /// @dev In order to submit a claim,20% tokens are deposited by the owner. In case a claim is escalated, another 20% tokens are deposited.
    /// @param coverid Cover Id.
    /// @param allDeposit 0 in case we want only 1 undeposit against a cover,1 in order to undeposit all deposits against a cover
    function undepositCN(uint coverid, uint8 allDeposit) onlyInternal
    {   
        td=NXMTokenData(tokenDataAddress);
        qd=quotationData(quotationDataAddress);
        address _to=qd.getCoverMemberAddress(coverid);
        if (td.getDepositCN(coverid , _to) < 0) throw;           // Check if the cover has tokens
        uint len = td.getUser_cover_depositCNLength(_to,coverid);
        uint vUpto;
        uint amount;
        for(uint i=0;i<len;i++)
        {
            (vUpto,amount) = td.getUser_cover_depositCNByIndex(_to,coverid,i);
            if(vUpto>=now)
            {
                td.updateUser_cover_depositCNByIndex(_to,coverid,i,now,amount);
                if(allDeposit==0)
                    break;
            }
        }
    }
    
    /// @dev Locks a given number of tokens for Claim Assessment.
    /// @param _value number of tokens lock.
    /// @param _days Validity(in days) of tokens.
    function lockCA(uint _value,uint _days) isMemberAndcheckPause
    {
        td = NXMTokenData(tokenDataAddress);
        if (SafeMaths.sub(SafeMaths.sub(td.getBalanceOf(msg.sender),td.getBalanceCAWithAddress(msg.sender)),td.getBalanceCN(msg.sender)) < _value) throw;// Check if the sender has enough
        if (_value<=0) throw;
        td.lockCA(msg.sender,SafeMaths.add(now,SafeMaths.mul(_days,1 days)),_value);        
    }

    // Arjun - Data Begin
    /// @dev Burns tokens locked against a Smart Contract Cover, called when a claim submitted against this cover is accepted.
    /// @param coverid Cover Id.
    function burnStakerLockedToken(uint coverid,bytes4 curr,uint SA) onlyInternal 
    {
        td=NXMTokenData(tokenDataAddress);
        qd=quotationData(quotationDataAddress);
        tc1=NXMToken(tokenAddress);
        address _scAddress;
        (,_scAddress) = qd.getscAddressOfCover(coverid);
        m1=MCR(mcrAddress);
        uint tokenPrice=m1.calculateTokenPrice(curr);
        SA=SafeMaths.mul(SA,_DECIMAL_1e18);
        uint burnNXMAmount=SafeMaths.mul(SafeMaths.div(SA,tokenPrice),_DECIMAL_1e18);
        uint totalStaker=td.getTotalStakerAgainstScAddress(_scAddress);
        for(uint i=0; i<totalStaker;i++)
        {
            if(burnNXMAmount>0){
                uint scAddressIndex;
                (,scAddressIndex) = td.getScAddressIndexByScAddressAndIndex(_scAddress,i);
                address _of;uint dateAdd;
                (,_of,,,,dateAdd)=td.getStakeDetails(scAddressIndex);
                uint stakerLockedNXM = tc1.getLockedNXMTokenOfStaker(_scAddress,scAddressIndex);
                if(stakerLockedNXM > 0){
                    if(stakerLockedNXM>=burnNXMAmount){
                        td.updateBurnedAmount(scAddressIndex,burnNXMAmount);
                        burnLockedToken_extended(_of,coverid,burnNXMAmount,"Burn");
                        break;
                    }
                    else{
                        td.updateBurnedAmount(scAddressIndex,stakerLockedNXM);
                        burnLockedToken_extended(_of,coverid,stakerLockedNXM,"Burn");
                        burnNXMAmount=SafeMaths.sub(burnNXMAmount,stakerLockedNXM);
                    }
                }
            }
            else
                break;
        }
    }

    function burnLockedToken_extended(address _of,uint _coverid,uint _burnNXMAmount,bytes16 str) internal{
        td=NXMTokenData(tokenDataAddress);
        tc1=NXMToken(tokenAddress);
        tc1.callBurnEvent(_of,str, _coverid,_burnNXMAmount);
        // Update NXM token balance against member address and remove member in case overall balance=0
        td.changeBalanceOf(_of,SafeMaths.sub(td.getBalanceOf(_of), _burnNXMAmount));
        td.changeTotalSupply(SafeMaths.sub(td.getTotalSupply(), _burnNXMAmount));
        tc1.callTransferEvent(_of, 0, _burnNXMAmount); // notify of the event
    }

    function addStake(address _scAddress, uint _amount) isMemberAndcheckPause 
    {
        td=NXMTokenData(tokenDataAddress);
        tc1=NXMToken(tokenAddress);
        if (SafeMaths.sub(SafeMaths.sub(SafeMaths.sub(td.getBalanceOf(msg.sender),td.getBalanceCAWithAddress(msg.sender)),td.getBalanceCN(msg.sender)),tc1.getLockedNXMTokenOfStakerByStakerAddress(msg.sender)) < _amount) throw;           // Check if the sender has enough
        td.addStake(msg.sender,_scAddress, _amount);
    }

    function payJoiningFee() payable{
        td=NXMTokenData(tokenDataAddress);
        mr=MemberRoles(memberAddress);
        require(msg.value==td.joiningFee());
        address _add = td.walletAddress();
        require(_add!=0x0000);
        bool succ = _add.send(msg.value);                
        if(succ == true)
            mr.updateMemberRole(msg.sender,3,1);
    }
    function setWalletAddress(address _add) isMemberAndcheckPause {
        td=NXMTokenData(tokenDataAddress);
        td.setWalletAddress(_add);
    }
}