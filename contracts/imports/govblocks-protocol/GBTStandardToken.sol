/* Copyright (C) 2017 GovBlocks.io

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
import "./StandardToken.sol";
import "./SafeMath.sol";


contract GBTStandardToken is ERC20Basic, ERC20 {
    event TransferGBT(address indexed from, address indexed to, uint256 value, bytes32 description);

    using SafeMath for uint;
    uint public tokenPrice;
    string public name;
    string public symbol;
    uint public decimals;
    address public owner;
    uint public totalSupply;
    //address internal GBTCAddress;

    struct Lock {
        uint amount;
        uint validUpto;
    }

    mapping(address => Lock[]) internal userLockToken;
    mapping(address => uint256) internal balances;
    mapping(bytes32 => bool) public verifyTxHash;

    /// @dev constructor
    constructor() public {
        owner = msg.sender;
        balances[address(this)] = 0;
        name = "GBT";
        symbol = "GBT";
        decimals = 18;
        tokenPrice = 1 * 10 ** 15;
    }

    /**
     * @dev transfer token for a specified address
     * @param _to The address to transfer to.
     * @param _value The amount to be transferred.
     */
    function transfer(address _to, uint256 _value) public returns(bool) {
        require(_to != address(0));
        require(_value <= (balances[msg.sender] - getLockToken(msg.sender)));

        // SafeMath.sub will throw if there is not enough balance.
        balances[msg.sender] = balances[msg.sender].sub(_value);
        balances[_to] = balances[_to].add(_value);
        emit Transfer(msg.sender, _to, _value);
        return true;
    }

    /**
     * @dev transfer token for a specified address and raise event with message
     * @param _to The address to transfer to.
     * @param _value The amount to be transferred.
     * @param _message The message to put in the event
     */
    function transferMessage(address _to, uint256 _value, bytes32 _message) public returns(bool) {
        bool trf = transfer(_to, _value);
        if (_message != "" && trf)
            emit TransferGBT(msg.sender, _to, _value, _message);
        return true;
    }

    /**
     * @dev Gets the balance of the specified address.
     * @param _owner The address to query the the balance of.
     * @return An uint256 representing the amount owned by the passed address.
     */
    function balanceOf(address _owner) public view returns(uint256 balance) {
        return balances[_owner];
    }

    /**
     * @dev locks token of a user.
     * @param _memberAddress The address of the use whose token are to be locked
     * @param _amount Amount to be locked
     * @param _validUpto lock validity
     * @param _lockTokenTxHash this, along with _v, _r, _s are used to authorization
     */
    function lockToken(
        address _memberAddress, 
        uint _amount, 
        uint _validUpto, 
        uint8 _v, 
        bytes32 _r, 
        bytes32 _s, 
        bytes32 _lockTokenTxHash
    ) 
        public 
    {
        require(!verifyTxHash[_lockTokenTxHash]);
        require(verifySign(_memberAddress, msg.sender, _amount, _validUpto, _lockTokenTxHash, _v, _r, _s));

        userLockToken[_memberAddress].push(Lock(_amount, _validUpto));
        verifyTxHash[_lockTokenTxHash] = true;
    }

    /**
     * @dev locks and deposits tokens of a user.
     * @param _memberAddress The address of the use whose token are to be locked
     * @param _stake Stake placed by the user
     * @param _depositAmount amount to be deposited
     * @param _validUpto lock validity
     * @param _lockTokenTxHash this, along with _v, _r, _s are used to authorization
     */
    function depositAndLockToken(
        address _memberAddress, 
        uint _stake,
        uint _depositAmount, 
        uint _validUpto, 
        uint8 _v, 
        bytes32 _r, 
        bytes32 _s, 
        bytes32 _lockTokenTxHash,
        address pool
    ) 
        public 
    {
        require(!verifyTxHash[_lockTokenTxHash]);
        uint lockAmount = SafeMath.sub(_stake, _depositAmount);
        require(verifySign(_memberAddress, msg.sender, lockAmount, _validUpto, _lockTokenTxHash, _v, _r, _s));
        if (lockAmount != 0) {
            userLockToken[_memberAddress].push(Lock(lockAmount, _validUpto));
        }
        allowed[_memberAddress][msg.sender] = allowed[_memberAddress][msg.sender].add(_depositAmount);
        emit Approval(_memberAddress, msg.sender, allowed[_memberAddress][msg.sender]);
        verifyTxHash[_lockTokenTxHash] = transferFromMessage(
                _memberAddress, 
                pool, 
                _depositAmount, 
                "Deposited Stake"
            );
    }

    /// @dev Verifies the signature to authorize transactions
    function verifySign(
        address _memberAddress, 
        address _spender, 
        uint _amount, 
        uint _validUpto, 
        bytes32 _lockTokenTxHash, 
        uint8 _v, 
        bytes32 _r, 
        bytes32 _s
    ) 
        public
        pure 
        returns(bool) 
    {
        bytes32 hash = getOrderHash(_memberAddress, _spender, _amount, _validUpto, _lockTokenTxHash);
        return isValidSignature(hash, _memberAddress, _v, _r, _s);
    }

    /// @dev generates order hash for verification
    function getOrderHash(
        address _memberAddress, 
        address _spender, 
        uint _amount, 
        uint _validUpto, 
        bytes32 _lockTokenTxHash
    ) 
        public
        pure 
        returns(bytes32) 
    {
        return keccak256(_memberAddress, _spender, _amount, _validUpto, _lockTokenTxHash);
    }

    /// @dev validates signature
    function isValidSignature(bytes32 hash, address _memberaddress, uint8 v, bytes32 r, bytes32 s) 
        public 
        pure 
        returns(bool) 
    {
        // bytes memory prefix = "\x19Ethereum Signed Message:\n32";
        // bytes32 prefixedHash = keccak256(prefix, hash);
        // address a= ecrecover(prefixedHash, v, r, s);    
        address a = ecrecover(hash, v, r, s);
        return (a == _memberaddress);
    }

    /// @dev returns the amount of locked user tokens
    function getLockToken(address _memberAddress) public view returns(uint lockedTokens) {
        uint time = now;
        lockedTokens = 0;
        for (uint i = 0; i < userLockToken[_memberAddress].length; i++) {
            if (userLockToken[_memberAddress][i].validUpto > time)
                lockedTokens = lockedTokens + userLockToken[_memberAddress][i].amount;
        }

    }

    mapping(address => mapping(address => uint256)) internal allowed;

    /**
     * @dev Transfer tokens from one address to another
     * @param _from address The address which you want to send tokens from
     * @param _to address The address which you want to transfer to
     * @param _value uint256 the amount of tokens to be transferred
     */
    function transferFrom(address _from, address _to, uint256 _value) public returns(bool) {
        bool trf = transferFromMessage(_from, _to, _value, "");
        return trf;
    }

    /**
     * @dev Transfer tokens from one address to another with a message
     * @param _from address The address which you want to send tokens from
     * @param _to address The address which you want to transfer to
     * @param _value uint256 the amount of tokens to be transferred
     * @param _message message for transfer
     */
    function transferFromMessage(address _from, address _to, uint256 _value, bytes32 _message) public returns(bool) {
        require(_to != address(0));
        require(_value <= (balances[_from] - getLockToken(msg.sender)));
        require(_value <= allowed[_from][msg.sender]);

        balances[_from] = balances[_from].sub(_value);
        balances[_to] = balances[_to].add(_value);
        allowed[_from][msg.sender] = allowed[_from][msg.sender].sub(_value);
        emit Transfer(_from, _to, _value);
        if (_message != "")
            emit TransferGBT(_from, _to, _value, _message);
        return true;
    }

    /**
     * @dev Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
     *
     * Beware that changing an allowance with this method brings the risk that someone may use both the old
     * and the new allowance by unfortunate transaction ordering. One possible solution to mitigate this
     * race condition is to first reduce the spender's allowance to 0 and set the desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     * @param _spender The address which will spend the funds.
     * @param _value The amount of tokens to be spent.
     */
    function approve(address _spender, uint256 _value) public returns(bool) {
        allowed[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    /**
     * @dev Function to check the amount of tokens that an owner allowed to a spender.
     * @param _owner address The address which owns the funds.
     * @param _spender address The address which will spend the funds.
     * @return A uint256 specifying the amount of tokens still available for the spender.
     */
    function allowance(address _owner, address _spender) public view returns(uint256 remaining) {
        return allowed[_owner][_spender];
    }

    /**
     * approve should be called when allowed[_spender] == 0. To increment
     * allowed value is better to use this function to avoid 2 calls (and wait until
     * the first transaction is mined)
     * From MonolithDAO Token.sol
     */
    function increaseApproval(address _spender, uint _addedValue) public returns(bool success) {
        allowed[msg.sender][_spender] = allowed[msg.sender][_spender].add(_addedValue);
        emit Approval(msg.sender, _spender, allowed[msg.sender][_spender]);
        return true;
    }

    /// @dev Decreases Approval for transfer by someone else
    function decreaseApproval(address _spender, uint _subtractedValue) public returns(bool success) {
        uint oldValue = allowed[msg.sender][_spender];
        if (_subtractedValue > oldValue) {
            allowed[msg.sender][_spender] = 0;
        } else {
            allowed[msg.sender][_spender] = oldValue.sub(_subtractedValue);
        }
        emit Approval(msg.sender, _spender, allowed[msg.sender][_spender]);
        return true;
    }
    /*modifier onlyGBTController {
        require(msg.sender == GBTCAddress);
        _;
    }*/

    event Mint(address indexed to, uint256 amount);
    event MintFinished();

    bool public mintingFinished = false;

    modifier canMint() {
        require(!mintingFinished);
        _;
    }

    modifier onlyOwner {
        require(msg.sender == owner);
        _;
    }

    /**
     * @dev Function to stop minting new tokens.
     * @return True if the operation was successful.
     */
    function finishMinting() public onlyOwner canMint returns(bool) {
        mintingFinished = true;
        emit MintFinished();
        return true;
    }

    /// @dev payable function to buy tokens. send ETH to get GBT
    function buyToken() public payable returns(uint actualAmount) {
        actualAmount = SafeMath.mul(SafeMath.div(msg.value, tokenPrice), 10 ** decimals);
        mint(msg.sender, actualAmount);
    }

    /// @dev function to change Token price
    function changeTokenPrice(uint _price) public onlyOwner {
        uint _tokenPrice = _price;
        tokenPrice = _tokenPrice;
    }

    /**
     * @dev Function to mint tokens
     * @param _to The address that will receive the minted tokens.
     * @param _amount The amount of tokens to mint.
     * @return A boolean that indicates if the operation was successful.
     */
    function mint(address _to, uint256 _amount) internal canMint returns(bool) {
        totalSupply = totalSupply.add(_amount);
        balances[_to] = balances[_to].add(_amount);
        emit Mint(_to, _amount);
        emit Transfer(address(0), _to, _amount);
        emit TransferGBT(address(0), _to, _amount, "Bought Tokens");
        return true;
    }
}