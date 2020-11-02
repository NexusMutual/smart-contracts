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
import "../claims/Claims.sol";
import "../cover/Quotation.sol";
import "./MCR.sol";
import "./Pool2.sol";
import "./PoolData.sol";

contract Pool1 is Iupgradable {
  using SafeMath for uint;

  Quotation public q2;
  NXMToken public tk;
  TokenController public tc;
  TokenFunctions public tf;
  Pool2 public p2;
  PoolData public pd;
  MCR public mcr;
  Claims public c1;
  TokenData public td;
  bool public locked;

  uint public constant MCR_PERCENTAGE_DECIMALS = 4;
  uint public constant MCR_PERCENTAGE_MULTIPLIER = 10 ** MCR_PERCENTAGE_DECIMALS;
  uint public constant MAX_MCR_PERCENTAGE = 4 * MCR_PERCENTAGE_MULTIPLIER; // 400%

  event Apiresult(address indexed sender, string msg, bytes32 myid);
  event Payout(address indexed to, uint coverId, uint tokens);

  event TokensSold (
    address seller,
    uint tokenAmount,
    uint ethReceived
  );

  modifier noReentrancy() {
    require(!locked, "Reentrant call.");
    locked = true;
    _;
    locked = false;
  }

  function() external payable {} // solhint-disable-line

  /**
   * @dev Pays out the sum assured in case a claim is accepted
   * @param coverid Cover Id.
   * @param claimid Claim Id.
   * @return succ true if payout is successful, false otherwise.
   */
  function sendClaimPayout(
    uint coverid,
    uint claimid,
    uint sumAssured,
    address payable coverHolder,
    bytes4 coverCurr
  )
  external
  onlyInternal
  noReentrancy
  returns (bool succ)
  {

    uint sa = sumAssured.div(1e18);
    bool check;
    IERC20 erc20 = IERC20(pd.getCurrencyAssetAddress(coverCurr));

    //Payout
    if (coverCurr == "ETH" && address(this).balance >= sumAssured) {
      // check = _transferCurrencyAsset(coverCurr, coverHolder, sumAssured);
      coverHolder.transfer(sumAssured);
      check = true;
    } else if (coverCurr == "DAI" && erc20.balanceOf(address(this)) >= sumAssured) {
      erc20.transfer(coverHolder, sumAssured);
      check = true;
    }

    if (check == true) {
      q2.removeSAFromCSA(coverid, sa);
      pd.changeCurrencyAssetVarMin(coverCurr,
        pd.getCurrencyAssetVarMin(coverCurr).sub(sumAssured));
      emit Payout(coverHolder, coverid, sumAssured);
      succ = true;
    } else {
      c1.setClaimStatus(claimid, 12);
    }

    // _triggerExternalLiquidityTrade();
    // p2.internalLiquiditySwap(coverCurr);

    tf.burnStakerLockedToken(coverid, coverCurr, sumAssured);
  }

  function triggerExternalLiquidityTrade() external onlyInternal {
    // deprecated
  }

  ///@dev Oraclize call to close emergency pause.
  function closeEmergencyPause(uint) external onlyInternal {
    _saveQueryId("EP", 0);
  }

  function closeClaimsOraclise(uint, uint) external onlyInternal {
    // deprecated
  }

  function closeCoverOraclise(uint, uint64) external onlyInternal {
    // deprecated
  }

  function mcrOraclise(uint) external onlyInternal {
    // deprecated
  }

  function mcrOracliseFail(uint, uint) external onlyInternal {
    // deprecated
  }

  function saveIADetailsOracalise(uint) external onlyInternal {
    // deprecated
  }

  /**
   * @dev Save the details of the current request for a future call
   * @param _typeof type of the query
   * @param id ID of the proposal, quote, cover etc. for which call is made
   */
  function _saveQueryId(bytes4 _typeof, uint id) internal {

    uint queryId = block.timestamp;
    bytes32 myid = bytes32(queryId);

    while (pd.getDateAddOfAPI(myid) != 0) {
      myid = bytes32(++queryId);
    }

    pd.saveApiDetails(myid, _typeof, id);
    pd.addInAllApiCall(myid);
  }

  /**
   * @dev Transfers all assest (i.e ETH balance, Currency Assest) from old Pool to new Pool
   * @param newPoolAddress Address of the new Pool
   */
  function upgradeCapitalPool(address payable newPoolAddress) external noReentrancy onlyInternal {
    for (uint64 i = 1; i < pd.getAllCurrenciesLen(); i++) {
      bytes4 caName = pd.getCurrenciesByIndex(i);
      _upgradeCapitalPool(caName, newPoolAddress);
    }
    if (address(this).balance > 0) {
      Pool1 newP1 = Pool1(newPoolAddress);
      newP1.sendEther.value(address(this).balance)();
    }
  }

  /**
   * @dev Iupgradable Interface to update dependent contract address
   */
  function changeDependentContractAddress() public {
    mcr = MCR(ms.getLatestAddress("MC"));
    tk = NXMToken(ms.tokenAddress());
    tf = TokenFunctions(ms.getLatestAddress("TF"));
    tc = TokenController(ms.getLatestAddress("TC"));
    pd = PoolData(ms.getLatestAddress("PD"));
    q2 = Quotation(ms.getLatestAddress("QT"));
    p2 = Pool2(ms.getLatestAddress("P2"));
    c1 = Claims(ms.getLatestAddress("CL"));
    td = TokenData(ms.getLatestAddress("TD"));
  }

  function sendEther() public payable {

  }

  /**
   * @dev transfers currency asset to an address
   * @param curr is the currency of currency asset to transfer
   * @param amount is amount of currency asset to transfer
   * @return boolean to represent success or failure
   */
  function transferCurrencyAsset(
    bytes4 curr,
    uint amount
  )
  public
  onlyInternal
  noReentrancy
  returns (bool)
  {

    return _transferCurrencyAsset(curr, amount);
  }

  /// @dev Handles callback of external oracle query.
  function __callback(bytes32 myid, string memory result) public {
    result; // silence compiler warning
    ms.delegateCallBack(myid);
  }

  /// @dev Enables user to purchase cover with funding in ETH.
  /// @param smartCAdd Smart Contract Address
  function makeCoverBegin(
    address smartCAdd,
    bytes4 coverCurr,
    uint[] memory coverDetails,
    uint16 coverPeriod,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) public isMember checkPause payable {
    require(msg.value == coverDetails[1]);
    q2.verifyCoverDetails(msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
  }

  /**
   * @dev Enables user to purchase cover via currency asset eg DAI
   */
  function makeCoverUsingCA(
    address smartCAdd,
    bytes4 coverCurr,
    uint[] memory coverDetails,
    uint16 coverPeriod,
    uint8 _v,
    bytes32 _r,
    bytes32 _s
  ) public isMember checkPause {
    IERC20 erc20 = IERC20(pd.getCurrencyAssetAddress(coverCurr));
    require(erc20.transferFrom(msg.sender, address(this), coverDetails[1]), "Transfer failed");
    q2.verifyCoverDetails(msg.sender, smartCAdd, coverCurr, coverDetails, coverPeriod, _v, _r, _s);
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
   * @dev (DEPRECATED, use sellTokens function instead) Allows selling of NXM for ether.
   * Seller first needs to give this contract allowance to
   * transfer/burn tokens in the NXMToken contract
   * @param  _amount Amount of NXM to sell
   * @return success returns true on successfull sale
   */
  function sellNXMTokens(uint _amount) public isMember noReentrancy checkPause returns (bool success) {
    sellTokens(_amount, 0);
    success = true;
  }

  /**
   * @dev (DEPRECATED, use MCR.getTokenSellValue function instead) Returns the amount of wei a seller will get for selling NXM
   * @param amount Amount of NXM to sell
   * @return weiToPay Amount of wei the seller will get
   */
  function getWei(uint amount) external view returns(uint weiToPay) {
    return mcr.getTokenSellValue(amount);
  }

  /**
   * @dev Buys NXM tokens with ETH.
   * @param  minTokensOut Minimum amount of tokens to be bought. Revert if boughtTokens falls below this number.
   * @return boughtTokens number of bought tokens.
   */
  function buyTokens(uint minTokensOut) public payable isMember checkPause returns (uint boughtTokens) {

    uint ethAmount = msg.value;
    require(ethAmount > 0);

    uint totalAssetValue = mcr.getTotalAssetValue(address(this).balance.sub(ethAmount));
    uint mcrEth = pd.getLastMCREther();
    uint mcrPercentage = mcr.calculateMCRPercentage(totalAssetValue, mcrEth);
    require(mcrPercentage <= MAX_MCR_PERCENTAGE, "Cannot purchase if MCR% > 400%");
    boughtTokens = mcr.calculateTokenBuyValue(ethAmount, totalAssetValue, mcrEth);
    require(boughtTokens >= minTokensOut, "boughtTokens is less than minTokensBought");
    tc.mint(msg.sender, boughtTokens);
  }

  /**
   * @dev Sell NXM tokens and receive ETH.
   * @param tokenAmount Amount of tokens to sell.
   * @param  minEthOut Minimum amount of ETH to be received. Revert if ethOut falls below this number.
   * @return ethOut amount of ETH received in exchange for the tokens.
   */
  function sellTokens(uint tokenAmount, uint minEthOut) public isMember checkPause returns (uint ethOut) {
    require(tk.balanceOf(msg.sender) >= tokenAmount, "Not enough balance");
    require(!tf.isLockedForMemberVote(msg.sender), "Member voted");

    uint currentTotalAssetValue = mcr.getTotalAssetValue(address(this).balance);
    uint mcrEth = pd.getLastMCREther();
    ethOut = mcr.calculateTokenSellValue(tokenAmount, currentTotalAssetValue, mcrEth);
    require(currentTotalAssetValue.sub(ethOut) > mcrEth, "MCR% cannot fall below 100%");
    require(ethOut >= minEthOut, "Token amount must be greater than minNXMTokensIn");

    tc.burnFrom(msg.sender, tokenAmount);
    msg.sender.transfer(ethOut);
    emit TokensSold(msg.sender, tokenAmount, ethOut);
  }

  /**
   * @dev gives the investment asset balance
   * @return investment asset balance
   */
  function getInvestmentAssetBalance() public view returns (uint balance) {
    IERC20 erc20;
    uint currTokens;
    for (uint i = 1; i < pd.getInvestmentCurrencyLen(); i++) {
      bytes4 currency = pd.getInvestmentCurrencyByIndex(i);
      erc20 = IERC20(pd.getInvestmentAssetAddress(currency));
      currTokens = erc20.balanceOf(address(p2));
      if (pd.getIAAvgRate(currency) > 0)
        balance = balance.add((currTokens.mul(100)).div(pd.getIAAvgRate(currency)));
    }

    balance = balance.add(address(p2).balance);
  }

  function getInvestmentAssetBalanceLoop() public view returns (uint balance) {
    IERC20 erc20;
    uint currTokens;
    for (uint i = 1; i < pd.getInvestmentCurrencyLen(); i++) {
      bytes4 currency = pd.getInvestmentCurrencyByIndex(i);
      erc20 = IERC20(pd.getInvestmentAssetAddress(currency));
      currTokens = erc20.balanceOf(address(p2));
      if (pd.getIAAvgRate(currency) > 0)
        balance = balance.add((currTokens.mul(100)).div(pd.getIAAvgRate(currency)));
    }
    return balance;
  }

  function getInvestmentAssetBalanceP2Balance() public view returns (uint balance) {
    balance = balance.add(address(p2).balance);
  }

  /**
   * @dev transfers currency asset
   * @param _curr is currency of asset to transfer
   * @param _amount is the amount to be transferred
   * @return boolean representing the success of transfer
   */
  function _transferCurrencyAsset(bytes4 _curr, uint _amount) internal returns (bool succ) {
    if (_curr == "ETH") {
      if (address(this).balance < _amount)
        _amount = address(this).balance;
      p2.sendEther.value(_amount)();
      succ = true;
    } else {
      IERC20 erc20 = IERC20(pd.getCurrencyAssetAddress(_curr)); // solhint-disable-line
      if (erc20.balanceOf(address(this)) < _amount)
        _amount = erc20.balanceOf(address(this));
      require(erc20.transfer(address(p2), _amount));
      succ = true;

    }
  }

  /**
   * @dev Transfers ERC20 Currency asset from this Pool to another Pool on upgrade.
   */
  function _upgradeCapitalPool(
    bytes4 _curr,
    address _newPoolAddress
  )
  internal
  {
    IERC20 erc20 = IERC20(pd.getCurrencyAssetAddress(_curr));
    if (erc20.balanceOf(address(this)) > 0)
      require(erc20.transfer(_newPoolAddress, erc20.balanceOf(address(this))));
  }

}
