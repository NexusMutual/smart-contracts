/* Copyright (C) 2020 NexusMutual.io

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

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../modules/claims/Claims.sol";
import "../../modules/cover/Quotation.sol";
import "../../modules/capital/MCR.sol";
import "../../modules/capital/PoolData.sol";
import "./P1MockOldMCR.sol";

contract P1MockOldPool1 is Iupgradable {
  using SafeMath for uint;

  Quotation internal q2;
  NXMToken internal tk;
  TokenController internal tc;
  TokenFunctions internal tf;
  PoolData internal pd;
  P1MockOldMCR internal m1;
  Claims public c1;
  TokenData internal td;
  bool internal locked;

  uint internal constant DECIMAL1E18 = uint(10) ** 18;

  modifier noReentrancy() {
    require(!locked, "Reentrant call.");
    locked = true;
    _;
    locked = false;
  }

  function() external payable {} // solhint-disable-line

  /**
   * @dev Iupgradable Interface to update dependent contract address
   */
  function changeDependentContractAddress() public {
    m1 = P1MockOldMCR(ms.getLatestAddress("MC"));
    tk = NXMToken(ms.tokenAddress());
    tf = TokenFunctions(ms.getLatestAddress("TF"));
    tc = TokenController(ms.getLatestAddress("TC"));
    pd = PoolData(ms.getLatestAddress("PD"));
    q2 = Quotation(ms.getLatestAddress("QT"));
    c1 = Claims(ms.getLatestAddress("CL"));
    td = TokenData(ms.getLatestAddress("TD"));
  }

  /// @dev Enables user to purchase NXM at the current token price.
  function buyToken() public payable isMember checkPause returns (bool success) {
    require(msg.value > 0);
    uint tokenPurchased = _getToken(address(this).balance, msg.value);
    tc.mint(msg.sender, tokenPurchased);
    success = true;
  }

  /// @dev Sends a given amount of Ether to a given address.
  /// @param amount amount (in wei) to send.
  /// @param _add Receiver's address.
  /// @return succ True if transfer is a success, otherwise False.
  function transferEther(uint amount, address payable _add) public noReentrancy checkPause returns (bool succ) {
    require(ms.checkIsAuthToGoverned(msg.sender), "Not authorized to Govern");
    succ = _add.send(amount);
  }

  /**
   * @dev Allows selling of NXM for ether.
   * Seller first needs to give this contract allowance to
   * transfer/burn tokens in the NXMToken contract
   * @param  _amount Amount of NXM to sell
   * @return success returns true on successfull sale
   */
  function sellNXMTokens(uint _amount) public isMember noReentrancy checkPause returns (bool success) {
    require(tk.balanceOf(msg.sender) >= _amount, "Not enough balance");
    require(!tf.isLockedForMemberVote(msg.sender), "Member voted");
    require(_amount <= m1.getMaxSellTokens(), "exceeds maximum token sell limit");
    uint sellingPrice = _getWei(_amount);
    tc.burnFrom(msg.sender, _amount);
    msg.sender.transfer(sellingPrice);
    success = true;
  }

  /**
   * @dev Returns the amount of wei a seller will get for selling NXM
   * @param amount Amount of NXM to sell
   * @return weiToPay Amount of wei the seller will get
   */
  function getWei(uint amount) public view returns (uint weiToPay) {
    return _getWei(amount);
  }

  /**
   * @dev Returns the amount of token a buyer will get for corresponding wei
   * @param weiPaid Amount of wei
   * @return tokenToGet Amount of tokens the buyer will get
   */
  function getToken(uint weiPaid) public view returns (uint tokenToGet) {
    return _getToken((address(this).balance).add(weiPaid), weiPaid);
  }

  /**
   * @dev Returns the amount of wei a seller will get for selling NXM
   * @param _amount Amount of NXM to sell
   * @return weiToPay Amount of wei the seller will get
   */
  function _getWei(uint _amount) internal view returns (uint weiToPay) {
    uint tokenPrice;
    uint weiPaid;
    uint tokenSupply = tk.totalSupply();
    uint vtp;
    uint mcrFullperc;
    uint vFull;
    uint mcrtp;
    (mcrFullperc, , vFull,) = pd.getLastMCR();
    (vtp,) = m1.calVtpAndMCRtp();

    while (_amount > 0) {
      mcrtp = (mcrFullperc.mul(vtp)).div(vFull);
      tokenPrice = m1.calculateStepTokenPrice("ETH", mcrtp);
      tokenPrice = (tokenPrice.mul(975)).div(1000); // 97.5%
      if (_amount <= td.priceStep().mul(DECIMAL1E18)) {
        weiToPay = weiToPay.add((tokenPrice.mul(_amount)).div(DECIMAL1E18));
        break;
      } else {
        _amount = _amount.sub(td.priceStep().mul(DECIMAL1E18));
        tokenSupply = tokenSupply.sub(td.priceStep().mul(DECIMAL1E18));
        weiPaid = (tokenPrice.mul(td.priceStep().mul(DECIMAL1E18))).div(DECIMAL1E18);
        vtp = vtp.sub(weiPaid);
        weiToPay = weiToPay.add(weiPaid);
      }
    }
  }

  /**
   * @dev gives the token
   * @param _poolBalance is the pool balance
   * @param _weiPaid is the amount paid in wei
   * @return the token to get
   */
  function _getToken(uint _poolBalance, uint _weiPaid) internal view returns (uint tokenToGet) {
    uint tokenPrice;
    uint superWeiLeft = (_weiPaid).mul(DECIMAL1E18);
    uint tempTokens;
    uint superWeiSpent;
    uint tokenSupply = tk.totalSupply();
    uint vtp;
    uint mcrFullperc;
    uint vFull;
    uint mcrtp;
    (mcrFullperc, , vFull,) = pd.getLastMCR();
    (vtp,) = m1.calculateVtpAndMCRtp((_poolBalance).sub(_weiPaid));

    require(m1.calculateTokenPrice("ETH") > 0, "Token price can not be zero");
    while (superWeiLeft > 0) {
      mcrtp = (mcrFullperc.mul(vtp)).div(vFull);
      tokenPrice = m1.calculateStepTokenPrice("ETH", mcrtp);
      tempTokens = superWeiLeft.div(tokenPrice);
      if (tempTokens <= td.priceStep().mul(DECIMAL1E18)) {
        tokenToGet = tokenToGet.add(tempTokens);
        break;
      } else {
        tokenToGet = tokenToGet.add(td.priceStep().mul(DECIMAL1E18));
        tokenSupply = tokenSupply.add(td.priceStep().mul(DECIMAL1E18));
        superWeiSpent = td.priceStep().mul(DECIMAL1E18).mul(tokenPrice);
        superWeiLeft = superWeiLeft.sub(superWeiSpent);
        vtp = vtp.add((td.priceStep().mul(DECIMAL1E18).mul(tokenPrice)).div(DECIMAL1E18));
      }
    }
  }
}
