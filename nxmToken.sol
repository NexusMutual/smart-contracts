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
import "./mcr.sol";
import "./nxmTokenData.sol";
import "./nxmToken2.sol";
import "./master.sol";
import "./SafeMaths.sol";
import "./quotationData.sol";
// import "./memberRoles.sol";
contract nxmToken {
    using SafeMaths for uint;

    
    address masterAddress;
    // address mcrAddress;
    // address nxmToken2Address;
    // address nxmTokenDataAddress;
    // address quotationDataAddress;
    // address memberRolesAddress;
    
    master ms;
    quotationData qd;
    mcr m1;
    nxmTokenData td;
    // address owner;
    nxmToken2 tc2;
    // memberRoles mr;
    
    uint64 private constant _DECIMAL_1e18 = 1000000000000000000;
    
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed _owner, address indexed _spender, uint256 _value);
    event Burn(address indexed _of,bytes16 eventName , uint coverId ,uint tokens);
    function changeMasterAddress(address _add)
    {
        if(masterAddress == 0x000){
            masterAddress = _add;
            ms=master(masterAddress);
        }
        else
        {
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
    modifier onlyOwner{
        // ms=master(masterAddress);
        require(ms.isOwner(msg.sender) == true);
        _; 
    }
    modifier checkPause
    {
        // ms=master(masterAddress);
        require(ms.isPause()==false);
        _;
    }
    modifier isMemberAndcheckPause
    {
        // ms=master(masterAddress);
        require(ms.isPause()==false && ms.isMember(msg.sender)==true);
        _;
    }
    // function nxmToken() 
    // {
    //     // owner = msg.sender;
    // }
    
    // function changeMemberRolesAddress(address memberRolesAddress) onlyInternal
    // {
    //     mr = memberRoles(memberRolesAddress);
    // }

    function changeMCRAddress(address mcrAddress) onlyInternal
    {
        // mcrAddress = _add;
        m1=mcr(mcrAddress);
        // tc2=NXMToken2(nxmtoken2Address);
        // tc2.changeMCRAddress(mcrAddress);
    }
    function changeToken2Address(address nxmToken2Address) onlyInternal
    {
        // nxmtoken2Address = _add;
        tc2=nxmToken2(nxmToken2Address);
    }
    
    function changeQuotationDataAddress(address quotationDataAddress) onlyInternal
    {
        // quotationDataAddress = _add;
        qd=quotationData(quotationDataAddress);
    }
    
    function changeTokenDataAddress(address nxmTokenDataAddress) onlyInternal
    {
        // nxmtokenDataAddress = _add;
        td = nxmTokenData(nxmTokenDataAddress);
    }

    /// @dev Allocates tokens to a Founder Member and stores the details. Updates the number of tokens that have been allocated already by the creator till date.
    /// @param _to Member address.
    /// @param tokens Number of tokens.
    function allocateFounderTokens(address _to , uint tokens) onlyOwner
    {
        // td = NXMTokenData(tokenDataAddress);
        if(SafeMaths.add(td.getCurrentFounderTokens() , tokens) <= td.getInitialFounderTokens())
        {
            td.changeCurrentFounderTokens(SafeMaths.add(td.currentFounderTokens(),tokens));
            td.addInAllocatedFounderTokens(_to , tokens);
            // tc2=NXMToken2(nxmtoken2Address);
            tc2.rewardToken(_to,SafeMaths.mul(tokens,_DECIMAL_1e18));
        }
    }
   
    // Gets the total number of tokens that are in circulation.
    function totalSupply() constant returns(uint ts)
    {
        // td = NXMTokenData(tokenDataAddress);
        ts = td.getTotalSupply();
    }
    function symbol() constant returns(bytes8 _symbol)
    {
        // td = NXMTokenData(tokenDataAddress);
        _symbol=td.symbol();
    }
    function decimals() constant returns(uint8 _decimals)
    {
        // td = NXMTokenData(tokenDataAddress);
        _decimals=td.decimals();
    }
    /// @dev Gets the address of a member using index.
    // function allMembers(uint i)constant returns(address _add)
    // {
    //     td = NXMTokenData(tokenDataAddress);
    //     _add = td.getMember_index(i);
    // }

    /// @dev Adds a given amount, in a given currency, to the pool fund 
    // function addToPoolFund(bytes4 curr , uint amount) onlyInternal
    // {
    //     td = NXMTokenData(tokenDataAddress);
    //     td.changePoolFundValue(curr,SafeMaths.add(td.getPoolFundValue(curr) , amount));
    // }

    /// @dev Subtracts a given amount from the pool fund.
    // function removeFromPoolFund(bytes4 curr , uint amount) onlyInternal
    // {
    //     td = NXMTokenData(tokenDataAddress);
    //     uint value = td.getPoolFundValue(curr);
    //     if(value<amount)
    //         td.changePoolFundValue(curr,0);
    //     else
    //         td.changePoolFundValue(curr,SafeMaths.sub(td.getPoolFundValue(curr) , amount));
    // }

    /// @dev Gets Pool's Fund amount of a given currency.
    /// @param curr Currency Name.
    /// @return amount Total fund amount.
    // function getPoolFundValue(bytes4 curr) constant returns(uint amount)
    // {
    //     td = NXMTokenData(tokenDataAddress);
    //     amount=td.getPoolFundValue(curr);
    // }

    /// @dev Books the user's tokens for maintaining Assessor Velocity, i.e., these tokens cannot be used to cast another vote for a specified period of time.
    /// @param _to Claims assessor address.
    /// @param value number of tokens that will be booked for a period of time. 
    function bookCATokens(address _to , uint value)  onlyInternal
    {
        // td = NXMTokenData(tokenDataAddress);
        td.pushBookedCA(_to,value);

    }

    // /// @dev Gets the validity date and number of tokens locked under CA at a given index of mapping
    // /// @return index Id of mapping.
    // /// @return valid Lock validity (in timestamp)
    // /// @return tokensLocked Number of tokens locked.
    // function getLockCAWithIndex(uint mappedIndex) constant returns(uint index , uint valid , uint tokensLocked)
    // {
    //     // td = NXMTokenData(tokenDataAddress);
    //     index=mappedIndex;
    //     (,valid,tokensLocked) = td.getLockCAWithIndex(msg.sender , index);
    // }


    /// @dev Unlocks the Tokens of a given cover id
    function unlockCN(uint coverid) onlyInternal
    {
        // td=NXMTokenData(tokenDataAddress);
        // qd=quotationData(quotationDataAddress);
        address _to=qd.getCoverMemberAddress(coverid);
        // tc2=NXMToken2(nxmtoken2Address);
        //Undeposits all tokens associated with the coverid
        tc2.undepositCN(coverid,1);
        uint validity; 
        uint lockedCN;
        (,validity,lockedCN) = td.getUser_cover_lockedCN(_to,coverid);
        uint len = td.getLockedCNLength(_to);
        uint vUpto;
        uint lockedCN_i;
        for(uint i=0;i<len ;i++)
        {
            (,vUpto,lockedCN_i) = td.getUser_cover_lockedCN(_to,i);
            if( vUpto == validity && lockedCN_i == lockedCN)
            {
                // Updates the validity of lock to now, thereby ending the lock on tokens
                td.updateLockedCN(_to,i,now,lockedCN_i);
                break;
            }
        }
       
        td.updateUser_cover_lockedCN(_to,coverid,now,lockedCN);  
    }

    /// @dev Gets the total number of tokens available for the Claim Assessment.    
    function getAvailableCAToken() constant returns (uint tokenAvailableCA)
    {
        // td = NXMTokenData(tokenDataAddress);
        tokenAvailableCA=0;uint validUpto;uint lockCAamount;
        address _of=msg.sender;
        //Tokens locked for at least a specified minimum lock period can be used for voting
        for(uint i=0 ; i < td.getLockCALength(_of) ;i++ )
        { 
            (,validUpto,lockCAamount)= td.getLockCAWithIndex(_of,i);
            if(SafeMaths.add(now , td.getMinVoteLockPeriod()) < validUpto)
                tokenAvailableCA=SafeMaths.add(tokenAvailableCA,lockCAamount);
        }
        // Booked tokens cannot be used for claims assessment
        uint bookedamt=td.getBookedCA(_of);
        if(tokenAvailableCA>bookedamt)
            tokenAvailableCA=SafeMaths.sub(tokenAvailableCA,bookedamt);
        else
             tokenAvailableCA=0;
    }  

    
    /// @dev Gets the Token balance (lock + available) of a given address.
    function balanceOf(address _add) constant returns(uint balance) 
    {
        // td = NXMTokenData(tokenDataAddress);
        balance = td.getBalanceOf(_add);
    }
    
    /// @dev Triggers an event when Tokens are burnt.
    function callBurnEvent(address _add,bytes16 str,uint id,uint value) onlyInternal
    {
        Burn(_add,str,id,value);
    }
    /// @dev Triggers an event when Transfer of NXM tokens occur. 
    function callTransferEvent(address _from,address _to,uint value) onlyInternal
    {
        Transfer(_from, _to, value);
    }

    /// @dev Transfer Tokens from the sender to the given Receiver's account.
    /// @param _to Receiver's Address.
    /// @param _value Transfer tokens.
    function transfer(address _to, uint256 _value) isMemberAndcheckPause  {
        // ms=master(masterAddress);
        require(ms.isMember(_to)==true);
        // td = NXMTokenData(tokenDataAddress);
        if(_value <= 0) throw;
        //available transfer balance=Total Token balance - Locked tokens
        if (SafeMaths.sub(SafeMaths.sub(SafeMaths.sub(td.getBalanceOf(msg.sender),td.getBalanceCAWithAddress(msg.sender)),td.getBalanceCN(msg.sender)),getLockedNXMTokenOfStakerByStakerAddress(msg.sender)) < _value) throw;           // Check if the sender has enough
        if (SafeMaths.add(td.getBalanceOf(_to) , _value) < td.getBalanceOf(_to)) throw; // Check for overflows
        td.changeBalanceOf(msg.sender,SafeMaths.sub(td.getBalanceOf(msg.sender), _value));                      // Subtract from the sender
        // if(td.getBalanceOf(msg.sender)==0)
        //     td.decMemberCounter();
        // if(td.getBalanceOf(_to) == 0)
        //     td.incMemberCounter();
        td.changeBalanceOf(_to,SafeMaths.add(td.getBalanceOf(_to) , _value));                           // Add the same to the recipient
        // Add a new member whenever applicable
        // if(td.checkInallMemberArray(_to)==0)
        // {
        //     td.addInAllMemberArray(_to);
        // }
        Transfer(msg.sender, _to, _value);                   // Notify anyone listening that this transfer took place
    }
   
    /// @dev Allows a given address (Spender) to spend a given amount of the money on behalf of the other user.
    /// @param _spender Spender's address.
    /// @param _value Amount upto which Spender is allowed to transfer.
    function approve(address _spender, uint256 _value) checkPause
    returns (bool success) {
        // td = NXMTokenData(tokenDataAddress);
        td.setAllower_spender_allowance(msg.sender,_spender, _value);
        return true;
    }


    /// @dev Allows a given address (Spender) to spend a given amount of the money on behalf of the other user.
    /// @param _spender Spender's address.
    /// @param _value amount upto which Spender is allowed to transfer.
    /// @param _extraData Extra Data.
    function approveAndCall(address _spender, uint256 _value, bytes _extraData)  checkPause
    returns (bool success) {
        // td = NXMTokenData(tokenDataAddress);
        td.setAllower_spender_allowance(msg.sender,_spender, _value);
        Approval(msg.sender, _spender, _value);

    //call the receiveApproval function on the contract you want to be notified. This crafts the function signature manually so one doesn't have to include a contract in here just for this.
    //receiveApproval(address _from, uint256 _value, address _tokenContract, bytes _extraData)
    //it is assumed that when does this that the call *should* succeed, otherwise one would use vanilla approve instead.
        if(!_spender.call(bytes4(bytes32(sha3("receiveApproval(address,uint256,address,bytes)"))), msg.sender, _value, this, _extraData)) { throw; }
        return true;
    }

    /// @dev Transfer the Tokens from a given sender's Address to a given receiver's address. If the msg.sender is not allowed to transfer tokens on the behalf of the _from , then transfer will be unsuccessful.
    /// @param _from Sender's address.
    /// @param _to Receiver's address.
    /// @param _value Transfer tokens.
     /// @return success true if transfer is a success, false if transfer is a failure.
    function transferFrom(address _from, address _to, uint256 _value)  isMemberAndcheckPause
    returns (bool success) {
        // ms=master(masterAddress);
        require(ms.isMember(_to)==true);
        // td = NXMTokenData(tokenDataAddress);
        if (SafeMaths.sub(SafeMaths.sub(SafeMaths.sub(td.getBalanceOf(_from),td.getBalanceCAWithAddress(_from)),td.getBalanceCN(_from)),getLockedNXMTokenOfStakerByStakerAddress(msg.sender)) < _value) throw;                 // Check if the sender has enough
        if (SafeMaths.add(td.getBalanceOf(_to) , _value) < td.getBalanceOf(_to)) throw;  // Check for overflows
        if (_value > td.getAllower_spender_allowance(_from,msg.sender)) throw;     // Check allowance
        td.changeBalanceOf(_from,SafeMaths.sub(td.getBalanceOf(_from) , _value));                    // Subtract from the sender
        // if(td.getBalanceOf(_from)==0)
        //     td.decMemberCounter();
        // if(td.getBalanceOf(_to) == 0)
        //     td.incMemberCounter();
        td.changeBalanceOf(_to,SafeMaths.add(td.getBalanceOf(_to) , _value));                           // Add the same to the recipient
        // if(td.checkInallMemberArray(_to)==0)
        // {
        //     td.addInAllMemberArray(_to);
        // }
        td.setAllower_spender_allowance(_from,msg.sender,SafeMaths.sub(td.getAllower_spender_allowance(_from,msg.sender) , _value));
        
        Transfer(_from, _to, _value);
        return true;
    }

    /// @dev User can buy the NXMTokens equivalent to the amount paid by the user.
    function buyToken(uint value , address _to) onlyInternal {
        // td = NXMTokenData(tokenDataAddress);
        // m1=MCR(mcrAddress);
        if(m1.calculateTokenPrice("ETH")>0)
        {
            uint256 amount = SafeMaths.div((SafeMaths.mul(value,_DECIMAL_1e18)),m1.calculateTokenPrice("ETH"));
            // td.changePoolFundValue("ETH",SafeMaths.add(td.getPoolFundValue("ETH"),value));
            // tc2=NXMToken2(nxmtoken2Address);  
            // Allocate tokens         
            tc2.rewardToken(_to,amount);
        }
    }
   
    /// @dev Gets the Token price in a given currency
    /// @param curr Currency name.
    /// @return price Token Price.
    function getTokenPrice(bytes4 curr) constant returns(uint price)
    {
        // m1=MCR(mcrAddress);
        price= m1.calculateTokenPrice(curr); 
         
    }

    /// @dev Burns the NXM Tokens of a given address. Updates the balance of the user and total supply of the tokens. 
    /// @param tokens Number of tokens
    /// @param _of User's address.
    function burnTokenForFunding(uint tokens , address _of, bytes16 str,uint id) onlyInternal
    {
        // td = NXMTokenData(tokenDataAddress);
        if(td.getBalanceOf(_of) < tokens) throw;
        td.changeBalanceOf(_of,SafeMaths.sub(td.getBalanceOf(_of) , tokens));
        // td.changeCurrencyTokens("ETH",SafeMaths.sub(td.getCurrencyTokens("ETH"),tokens));
        td.changeTotalSupply(SafeMaths.sub(td.getTotalSupply() , tokens));
        Burn(_of,str,id,tokens);
    }
   
    // /// @dev Gets the number of tokens of a given currency.
    // /// @param curr Currency name.
    // /// @return tokens Number of tokens.
    // function getCurrencyWiseTokens(bytes4 curr)constant returns(uint tokens)
    // {
    //     td = NXMTokenData(tokenDataAddress);
    //     tokens = td.getCurrencyTokens(curr);
    // }
    
    /// @dev Undeposit, Deposit, Unlock and Push In Locked CN
    /// @param _of address of Member
    /// @param _coverid Cover Id
    /// @param _Locktime Pending Time + Cover Period 7*1 days
    function DepositLockCN_EPOff(address _of, uint _coverid,uint _Locktime) onlyInternal
    {
        // qd = quotationData(quotationDataAddress);
        // td = NXMTokenData(tokenDataAddress);
        // tc2 = NXMToken2(nxmtoken2Address);

        uint timestamp=now+_Locktime;

        uint dCN_ValidUpto;
        uint dCN_LastAmount;
        uint len;
        (,len)=td.getUser_cover_depositCNLength(_of,_coverid);
        (,,dCN_ValidUpto,dCN_LastAmount)=td.getUser_cover_depositCNByIndex(_of,_coverid,SafeMaths.sub(len,1));
        uint dCN_Amount;
        (,dCN_Amount) = td.getDepositCN(_coverid,_of);

        uint coverValidUntil=qd.getValidityOfCover(_coverid);
        if(coverValidUntil>timestamp){
            if(dCN_ValidUpto<timestamp)
            {
                if(dCN_Amount>0)
                   {tc2.undepositCN(_coverid,1);
                    tc2.depositCN(_coverid,dCN_Amount,timestamp,_of); }
                else
                    tc2.depositCN(_coverid,dCN_LastAmount,timestamp,_of);
            }
        }
        else if(coverValidUntil>now){
            unlockCN(_coverid);
            if(dCN_Amount>0){
                td.pushInUser_cover_lockedCN(_of,_coverid,timestamp,dCN_Amount);
                tc2.depositCN(_coverid,dCN_Amount,timestamp,_of);
            }
            else{
                td.pushInUser_cover_lockedCN(_of,_coverid,timestamp,dCN_LastAmount);
                tc2.depositCN(_coverid,dCN_LastAmount,timestamp,_of);
            }
            
        }
        else if(coverValidUntil<now){
            if(dCN_Amount>0){
                tc2.undepositCN(_coverid,1);
                td.pushInUser_cover_lockedCN(_of,_coverid,timestamp,dCN_Amount);
                tc2.depositCN(_coverid,dCN_Amount,timestamp,_of);
            }
            else{
                td.pushInUser_cover_lockedCN(_of,_coverid,timestamp,dCN_LastAmount);
                tc2.depositCN(_coverid,dCN_LastAmount,timestamp,_of);
            }
        }
    }
    function getTotalLockedNXMToken(address _scAddress) constant returns (uint _totalLockedNXM)
    {
        _totalLockedNXM=0;
        // td=NXMTokenData(tokenDataAddress);
        uint stakeAmt; uint dateAdd; uint burnedAmt;
        uint nowTime=now;
        uint totalStaker=td.getTotalStakerAgainstScAddress(_scAddress);
        for(uint i=0; i<totalStaker;i++){
            uint scAddressIndx;
            (,scAddressIndx) = td.getScAddressIndexByScAddressAndIndex(_scAddress,i);
            (,,,stakeAmt,burnedAmt,dateAdd)=td.getStakeDetails(scAddressIndx);
            uint16 day1=uint16(SafeMaths.div(SafeMaths.sub(nowTime,dateAdd),1 days));
            if(stakeAmt>0 && td.scValidDays()>day1){
                uint lockedNXM = SafeMaths.div(SafeMaths.mul(SafeMaths.div(SafeMaths.mul(SafeMaths.sub(td.scValidDays(),day1),100000),td.scValidDays()),stakeAmt),100000);
                if(lockedNXM>burnedAmt)
                _totalLockedNXM = SafeMaths.add(_totalLockedNXM,SafeMaths.sub(lockedNXM,burnedAmt));
            }
        } 
    }
    function getLockedNXMTokenOfStaker(address _scAddress, uint _scAddressIndex) constant returns (uint _stakerLockedNXM)
    {
        _stakerLockedNXM=0;
        // td=NXMTokenData(tokenDataAddress);
        address scAddress; uint stakeAmt; uint dateAdd; uint burnedAmt;
        uint nowTime=now;
        (,,scAddress,stakeAmt,burnedAmt,dateAdd)=td.getStakeDetails(_scAddressIndex);
        uint16 day1=uint16(SafeMaths.div(SafeMaths.sub(nowTime,dateAdd),1 days));
        if(_scAddress==scAddress && stakeAmt>0 && td.scValidDays()>day1){
            uint lockedNXM = SafeMaths.div(SafeMaths.mul(SafeMaths.div(SafeMaths.mul(SafeMaths.sub(td.scValidDays(),day1),100000),td.scValidDays()),stakeAmt),100000);
            if(lockedNXM>burnedAmt)
                _stakerLockedNXM = SafeMaths.sub(lockedNXM,burnedAmt);
        }
    }
    function getLockedNXMTokenOfStakerByStakerAddress(address _of) constant returns (uint _stakerLockedNXM)
    {
        _stakerLockedNXM=0;
        // td=NXMTokenData(tokenDataAddress);
        uint stakeAmt; uint dateAdd; uint burnedAmt; 
        uint nowTime=now;
        uint totalStaker=td.getTotalScAddressesAgainstStaker(_of);
        for(uint i=0; i<totalStaker; i++){
            uint stakerIndx;
            (,stakerIndx) = td.getStakerIndexByStakerAddAndIndex(_of,i);
            (,,,stakeAmt,burnedAmt,dateAdd)=td.getStakeDetails(stakerIndx);
            uint16 dayStaked=uint16(SafeMaths.div(SafeMaths.sub(nowTime,dateAdd),1 days));
            if(stakeAmt>0 && td.scValidDays()>dayStaked){
               uint lockedNXM = SafeMaths.div(SafeMaths.mul(SafeMaths.div(SafeMaths.mul(SafeMaths.sub(td.scValidDays(),dayStaked),100000),td.scValidDays()),stakeAmt),100000);
               if(lockedNXM>burnedAmt)
                    _stakerLockedNXM = SafeMaths.add(_stakerLockedNXM,SafeMaths.sub(lockedNXM,burnedAmt));
            }
        } 
    }
    
    function updateStakerCommissions(address _scAddress,uint _premiumNXM) onlyInternal
    {
        // td=NXMTokenData(tokenDataAddress);
        // tc2=NXMToken2(nxmtoken2Address);
        // m1=MCR(mcrAddress);
        // uint tokenPrice=m1.calculateTokenPrice(_curr);
        // _premium=SafeMaths.mul(SafeMaths.div(SafeMaths.mul(_premium,100000),tokenPrice),10**13);
        uint commissionToBePaid = SafeMaths.div(SafeMaths.mul(_premiumNXM,20),100);
        uint stake_length=td.getTotalStakerAgainstScAddress(_scAddress);
        for(uint i=td.scAddress_lastCommIndex(_scAddress);i<stake_length;i++){
            if(commissionToBePaid>0){
                uint scAddressIndx;
                (,scAddressIndx) = td.getScAddressIndexByScAddressAndIndex(_scAddress,i);
                uint stakeAmt; address stakerAdd; 
                (,stakerAdd,,stakeAmt,,)=td.getStakeDetails(scAddressIndx);
                uint totalCommission = SafeMaths.div(SafeMaths.mul(stakeAmt,50),100);
                uint commissionPaid;
                (,commissionPaid)= td.getTotalStakeCommission(stakerAdd,_scAddress,scAddressIndx);
                if(totalCommission>commissionPaid){
                    if(totalCommission>=SafeMaths.add(commissionPaid,commissionToBePaid)){
                        td.pushStakeCommissions(stakerAdd,_scAddress,scAddressIndx,commissionToBePaid,now);
                        tc2.rewardToken(stakerAdd,commissionToBePaid);
                        if(i>0)
                            td.setSCAddress_lastCommIndex(_scAddress,SafeMaths.sub(i,1));
                        break;
                    }
                    else{
                        td.pushStakeCommissions(stakerAdd,_scAddress,scAddressIndx,SafeMaths.sub(totalCommission,commissionPaid),now);
                        tc2.rewardToken(stakerAdd,SafeMaths.sub(totalCommission,commissionPaid));
                        commissionToBePaid=SafeMaths.sub(commissionToBePaid,SafeMaths.sub(totalCommission,commissionPaid));
                    }
                }
            }
           
        }
        if(commissionToBePaid>0 && stake_length>0)
            td.setSCAddress_lastCommIndex(_scAddress,SafeMaths.sub(stake_length,1));
    }
}
