pragma solidity ^0.4.11;


import './StandardToken.sol';
// import '../ownership/Ownable.sol';
import './Ownable.sol';
import './SafeMath.sol';


/**
 * @title Mintable token
 * @dev Simple ERC20 Token example, with mintable token creation
 * @dev Issue: * https://github.com/OpenZeppelin/zeppelin-solidity/issues/120
 * Based on code by TokenMarketNet: https://github.com/TokenMarketNet/ico/blob/master/contracts/MintableToken.sol
 */

contract MintableToken is StandardToken, Ownable {
  event Mint(address indexed to, uint256 amount);
  event MintFinished();

  bool public mintingFinished = false;

  string public name;

  constructor (string _name) public {
     totalSupply_ = totalSupply_.add(100000);
     balances[msg.sender] = balances[msg.sender].add(100000);
     emit Mint(msg.sender, 100000);
     emit Transfer(address(0), msg.sender, 100000);  
     name = _name;
  }

  modifier canMint() {
    require(!mintingFinished);
    _;
  }

  /**
   * @dev Function to mint tokens
   * @param _to The address that will receive the minted tokens.
   * @param _amount The amount of tokens to mint.
   * @return A boolean that indicates if the operation was successful.
   */

  function mint(address _to, uint256 _amount) public canMint returns (bool) {
    totalSupply_ = totalSupply_.add(_amount);
    balances[_to] = balances[_to].add(_amount);
    emit Mint(_to, _amount);
    emit Transfer(address(0), _to, _amount);
    return true;
  }

  function allot(address _to, uint256 _amount) public canMint returns (bool) {
    balances[_to] = balances[_to].add(_amount);
    balances[owner] = balances[owner].sub(_amount);
    emit Transfer(owner, _to, _amount);
    return true;
  }

  /**
   * @dev Function to stop minting new tokens.
   * @return True if the operation was successful.
   */
  function finishMinting() public onlyOwner canMint returns (bool) {
    mintingFinished = true;
    emit MintFinished();
    return true;
  }
}