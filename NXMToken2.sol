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
import "./quotation2.sol";
import "./quotationData.sol";
import "./pool.sol";
import "./MCR.sol";
import "./NXMToken.sol";
import "./master.sol";
import "./SafeMaths.sol";
import "./MemberRoles.sol";
contract NXMToken2{
        using SafeMaths for uint;

    master ms1;
    address masterAddress;
    quotation2 q1;
    quotationData qd1;
    NXMTokenData td1;
    pool p1;
    MCR m1;
    NXMToken t1;
    MemberRoles mr1;
    address tokenAddress;
    address quotationDataAddress;
    address quotation2Address;
    address tokenDataAddress;
    address poolAddress;
    address mcrAddress;
    address memberAddress;
    function changeMasterAddress(address _add)
    {
        if(masterAddress == 0x000)
            masterAddress = _add;
        else
        {
            ms1=master(masterAddress);
            if(ms1.isInternal(msg.sender) == 1)
                masterAddress = _add;
            else
                throw;
        }
       
    }
    modifier onlyInternal {
        ms1=master(masterAddress);
        require(ms1.isInternal(msg.sender) == 1);
        _; 
    }
    modifier checkPause
    {
        ms1=master(masterAddress);
        require(ms1.isPause()==0);
        _;
    }
    modifier isMemberAndcheckPause
    {
        ms1=master(masterAddress);
        require(ms1.isPause()==0 && ms1.isMember(msg.sender)==true);
        _;
    }
    function changeTokenAddress(address _add) onlyInternal
    {

        tokenAddress = _add;
        t1=NXMToken(tokenAddress);
    } 
    function changeQuotationDataAddress(address _add) onlyInternal
    {
        quotationDataAddress = _add;
        qd1=quotationData(quotationDataAddress);
    } 
    function changeQuotationAddress(address _add) onlyInternal
    {
        quotation2Address = _add;
        q1=quotation2(quotation2Address);
    }
    
    function changeTokenDataAddress(address _add) onlyInternal
    {
        tokenDataAddress = _add;
        td1=NXMTokenData(tokenDataAddress);
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
       mr1=MemberRoles(memberAddress);
    }
    
    /// @dev Locks tokens against a cover.     
    /// @param premiumNxm Premium in NXM of cover.
    /// @param CoverPeriod Cover Period of cover.
    /// @param CoverId Cover id of a cover.
    /// @param senderAddress Quotation owner's Ethereum address.
    /// @return amount Number of tokens that are locked
    function lockCN ( uint premiumNxm,  uint16 CoverPeriod, uint CoverId, address senderAddress) onlyInternal returns(uint amount)
    {
        td1=NXMTokenData(tokenDataAddress);

        uint pastlocked;
        (,pastlocked) = td1.getLockedCN_Cover(senderAddress,CoverId);
        
        if(pastlocked !=0)
            throw;
     
        m1=MCR(mcrAddress);

        amount = SafeMaths.div(SafeMaths.mul(premiumNxm,5),100);
        td1.changeBalanceOf(senderAddress,SafeMaths.add(td1.getBalanceOf(senderAddress),amount));  

        // Updates the number of Supply Tokens and Pool fund value of a currency.
        td1.changeTotalSupply(SafeMaths.add(td1.getTotalSupply() , amount)); 
        uint ld=SafeMaths.add(SafeMaths.add(now,td1.LockTokenTimeAfterCoverExp()), uint(CoverPeriod)*1 days);
        td1.pushInLockedCN_Cover(senderAddress,CoverId,ld,amount);
        t1=NXMToken(tokenAddress);
        t1.callTransferEvent(0,senderAddress,amount); 
    }

    /// @dev Burns tokens used for fraudulent voting against a claim
    /// @param claimid Claim Id.
    /// @param _value number of tokens to be burned
    /// @param _to User's address.
    function burnCAToken(uint claimid , uint _value , address _to) onlyInternal {
        td1=NXMTokenData(tokenDataAddress);
        t1=NXMToken(tokenAddress);
        if( td1.getBalanceCAWithAddress(_to) < _value)throw;
        td1.pushInBurnCAToken(_to,claimid,now,_value);
        //Change overall member token balance
        td1.changeBalanceOf(_to,SafeMaths.sub(td1.getBalanceOf(_to) , _value)); 

        uint rem = _value;
        uint len=td1.getLockedCALength(_to);
        uint vUpto;
        uint amount;
        // Unlock tokens before burning
        for(uint i=0 ; i < len ;i++ )
        {
            (vUpto,amount) = td1.getLockedCA_index(_to , i);
            if(now<vUpto)
            {
                if(rem > amount)
                {
                    rem = SafeMaths.sub(rem,amount);
                    td1.changeLockedCA_Index(_to,i,0);
                }
                else
                {
                    td1.changeLockedCA_Index(_to,i,SafeMaths.sub(amount,rem));
                    rem=0;
                    break;
                }
            }
        }
        // Change total supply of NXM Tokens
        t1.callBurnEvent(_to,"BurnCA",claimid,_value);
        // td1.changeCurrencyTokens("ETH",SafeMaths.sub(td1.getCurrencyTokens("ETH"),_value));
        td1.changeTotalSupply(SafeMaths.sub(td1.getTotalSupply() , _value));
        t1.callTransferEvent(_to, 0, _value); // notify of the event
    }
    
    /// @dev Allocates tokens against a given address
    /// @param _to User's address.
    /// @param amount Number of tokens rewarded.
    function rewardToken(address _to,uint amount)  onlyInternal  {
        ms1=master(masterAddress);
        require(ms1.isMember(_to)==true);
        td1 = NXMTokenData(tokenDataAddress);
        // Change total supply and individual balance of user
        td1.changeBalanceOf(_to, SafeMaths.add(td1.getBalanceOf(_to) , amount));// mint new tokens
        td1.changeTotalSupply(SafeMaths.add(td1.getTotalSupply(),amount)); // track the supply
        t1=NXMToken(tokenAddress);
        t1.callTransferEvent(0,_to,amount); 
    }
       
    /// @dev Extends validity period of a given number of tokens, locked for Claim Assessment
    /// @param _to  User's address.
    /// @param _timestamp Timestamp for which tokens will be extended.
    /// @param noOfTokens Number of tokens that will get extended. Should be less than or equal to the number of tokens of selected bond. 
    function extendCAWithAddress(address _to ,uint _timestamp ,uint noOfTokens) onlyInternal
    {
        td1=NXMTokenData(tokenDataAddress);
        t1=NXMToken(tokenAddress);
        noOfTokens = SafeMaths.mul(noOfTokens , 10000000000);
        if(td1.getBalanceCAWithAddress(_to) < noOfTokens)throw;
        
        uint rem = noOfTokens;
        uint len = td1.getLockedCALength(_to);
        uint vUpto;
        uint amount;
        for(uint i=0 ; i < len ;i++ )
        {
            (vUpto , amount) = td1.getLockedCA_index(_to , i);
            if(amount>0 && vUpto > now)
            {
                if(rem > amount)
                {
                    rem = SafeMaths.sub(rem,amount);
                    td1.lockCA(_to,SafeMaths.add(vUpto , _timestamp),amount);
                    td1.changeLockedCA_Index(_to,i,0);
                
                }
                else
                {
                    td1.lockCA(_to,SafeMaths.add(vUpto , _timestamp),rem);
                    td1.changeLockedCA_Index(_to,i,SafeMaths.sub(amount,rem));
                    rem=0;
                
                    break;
                }
            }
        }
    }
    
    /// @dev Burns tokens deposited against a cover, called when a claim submitted against this cover is denied.
    /// @param coverid Cover Id.
    function burnCNToken(uint coverid) onlyInternal {
        td1=NXMTokenData(tokenDataAddress);
        qd1=quotationData(quotationDataAddress);
        address _to = qd1.getCoverMemberAddress(coverid);
        uint depositedTokens = td1.getDepositCN(coverid,_to);
        if(depositedTokens <= 0)throw;
        //Undeposit all tokens locked against the cover
        undepositCN(coverid,1);
        uint validity;
        uint amount1;
        (validity,amount1) = td1.getLockedCN_Cover(_to,coverid);
        uint len = td1.getLockedCNLength(_to);
        uint vUpto;
        uint amount;
        for(uint i=0;i<len ;i++)
        {
            (vUpto,amount) = td1.getLockedCN_index(_to,i);
            if(vUpto == validity && amount == amount1 )
            {
                td1.updateLockedCN(_to,i,vUpto,SafeMaths.sub(amount,depositedTokens));
                break;
            }
        }
        t1=NXMToken(tokenAddress);
        td1.updateLockedCN_Cover(_to,coverid,validity,SafeMaths.sub(amount1,depositedTokens));
        t1.callBurnEvent(_to,"Burn", coverid,depositedTokens);
        td1.changeBalanceOf(_to,SafeMaths.sub(td1.getBalanceOf(_to) , depositedTokens));
        td1.changeTotalSupply(SafeMaths.sub(td1.getTotalSupply() , depositedTokens));
        t1.callTransferEvent(_to, 0, depositedTokens); // notify of the event
    }
    
    /// @dev Deposits locked tokens against a given cover id, called whenever a claim is submitted against a coverid
    /// @param coverid Cover Id.
    /// @param _value number of tokens to deposit.
    /// @param _days Validity of tokens.
    /// @param _to User's address.
    function depositCN(uint coverid,uint _value,uint _days,address _to) onlyInternal
    {
        td1=NXMTokenData(tokenDataAddress);
        uint amount;
        (,amount) = td1.getLockedCN_Cover(_to,coverid);
        if (SafeMaths.sub(amount , td1.getDepositCN(coverid,msg.sender)) < _value) throw;           // Check if the sender has enough tokens to deposit
        if (_value<=0) throw;
        td1.pushInDepositCN_Cover(_to,coverid,_days,_value);
    }

    /// @dev Extends validity period of a given number of tokens locked for claims assessment.
    /// @param index  index of exisiting bond.
    /// @param _days number of days for which tokens will be extended.
    /// @param noOfTokens Number of tokens that will get extended. Should be less than or equal to the no.of tokens of selected bond.
    function extendCA(uint index , uint _days ,uint noOfTokens) isMemberAndcheckPause
    {
        td1=NXMTokenData(tokenDataAddress);
        uint vUpto;
        uint amount;
        (vUpto,amount) = td1.getLockedCA_index(msg.sender,index);
        if(vUpto <now || amount < noOfTokens )throw;
        td1.changeLockedCA_Index(msg.sender,index,SafeMaths.sub(amount,noOfTokens));
        td1.lockCA(msg.sender,(SafeMaths.add(vUpto ,SafeMaths.mul( _days, 1 days ))),noOfTokens);
               
    }

    /// @dev Unlocks tokens deposited against a cover.Changes the validity timestamp of deposit tokens.
    /// @dev In order to submit a claim,20% tokens are deposited by the owner. In case a claim is escalated, another 20% tokens are deposited.
    /// @param coverid Cover Id.
    /// @param all 0 in case we want only 1 undeposit against a cover,1 in order to undeposit all deposits against a cover
    function undepositCN(uint coverid, uint8 all) onlyInternal
    {   
        td1=NXMTokenData(tokenDataAddress);
        q1=quotation2(quotation2Address);
        address _to=q1.getMemberAddress(coverid);
        if (td1.getDepositCN(coverid , _to) < 0) throw;           // Check if the cover has tokens
        uint len = td1.getDepositCN_CoverLength(_to,coverid);
        uint vUpto;
        uint amount;
        for(uint i=0;i<len;i++)
        {
            (vUpto,amount) = td1.getDepositCN_Cover_Index(_to,coverid,i);
            if(vUpto>=now)
            {
                td1.updateDepositCN_Cover_Index(_to,coverid,i,now,amount);
                if(all==0)
                    break;
            }
        }
    }
    
    /// @dev Locks a given number of tokens for Claim Assessment.
    /// @param _value number of tokens lock.
    /// @param _days Validity(in days) of tokens.
    function lockCA(uint _value,uint _days) isMemberAndcheckPause
    {
        td1 = NXMTokenData(tokenDataAddress);
        if (SafeMaths.sub(SafeMaths.sub(td1.getBalanceOf(msg.sender),td1.getBalanceCAWithAddress(msg.sender)),td1.getBalanceCN(msg.sender)) < _value) throw;// Check if the sender has enough
        if (_value<=0) throw;
        td1.lockCA(msg.sender,SafeMaths.add(now,SafeMaths.mul(_days,1 days)),_value);        
    }

    /// @dev Burns tokens locked against a Smart Contract Cover, called when a claim submitted against this cover is accepted.
    /// @param coverid Cover Id.
    function burnStakerLockedToken(uint coverid,bytes4 curr,uint SA) onlyInternal 
    {
        td1=NXMTokenData(tokenDataAddress);
        qd1=quotationData(quotationDataAddress);
        t1=NXMToken(tokenAddress);
        address _scAddress;
        (,_scAddress) = qd1.getscAddressOfCover(coverid);
        m1=MCR(mcrAddress);
        uint tokenPrice=m1.calculateTokenPrice(curr);
        SA=SafeMaths.mul(SA,10**18);
        uint burnNXMAmount=SafeMaths.mul(SafeMaths.div(SA,tokenPrice),10**18);
        for(uint i=0; i<td1.getTotalStakerAgainstScAddress(_scAddress);i++)
        {
            if(burnNXMAmount>0){
                uint scAddressIndex;
                (,scAddressIndex) = td1.getScAddressIndexByScAddressAndIndex(_scAddress,i);
                address _of;uint dateAdd;
                (,_of,,,,dateAdd)=td1.getStakeDetails(scAddressIndex);
                uint stakerLockedNXM = t1.getLockedNXMTokenOfStaker(_scAddress,scAddressIndex);
                if(stakerLockedNXM > 0){
                    if(stakerLockedNXM>=burnNXMAmount){
                        burnStakerLockedToken1(_of,coverid,burnNXMAmount,scAddressIndex);
                        break;
                    }
                    else{
                        burnStakerLockedToken1(_of,coverid,stakerLockedNXM,scAddressIndex);
                        burnNXMAmount=SafeMaths.sub(burnNXMAmount,stakerLockedNXM);
                    }
                }
            }
            else
                break;
        }
    }

    function burnStakerLockedToken1(address _of,uint _coverid,uint _burnNXMAmount, uint _stakerIndex) internal
    {
        td1=NXMTokenData(tokenDataAddress);
        t1=NXMToken(tokenAddress);
        t1.callBurnEvent(_of,"Burn", _coverid,_burnNXMAmount);
        td1.updateBurnedAmount(_stakerIndex,_burnNXMAmount);
        // Update NXM token balance against member address and remove member in case overall balance=0
        td1.changeBalanceOf(_of,SafeMaths.sub(td1.getBalanceOf(_of) , _burnNXMAmount));
        td1.changeTotalSupply(SafeMaths.sub(td1.getTotalSupply() , _burnNXMAmount));
        t1.callTransferEvent(_of, 0, _burnNXMAmount); // notify of the event
    }

    function addStake(address _scAddress, uint _amount) isMemberAndcheckPause 
    {
        td1=NXMTokenData(tokenDataAddress);
        t1=NXMToken(tokenAddress);
        if (SafeMaths.sub(SafeMaths.sub(SafeMaths.sub(td1.getBalanceOf(msg.sender),td1.getBalanceCAWithAddress(msg.sender)),td1.getBalanceCN(msg.sender)),t1.getLockedNXMTokenOfStakerByStakerAddress(msg.sender)) < _amount) throw;           // Check if the sender has enough
        td1.addStake(msg.sender,_scAddress, _amount);
    }

    function payJoiningFee() payable{
        td1=NXMTokenData(tokenDataAddress);
        mr1=MemberRoles(memberAddress);
        require(msg.value==td1.joiningFee());
        address _add = td1.walletAddress();
        require(_add!=0x0000);
        bool succ = _add.send(msg.value);                
        if(succ == true)
            mr1.updateMemberRole(msg.sender,3,1);
    }

    function setWalletAddress(address _add) isMemberAndcheckPause {
        td1=NXMTokenData(tokenDataAddress);
        td1.setWalletAddress(_add);
    }
}