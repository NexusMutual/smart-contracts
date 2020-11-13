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
import "./Pool2.sol";
import "./PoolData.sol";
import "../../oracles/PriceFeedOracle.sol";

contract Pool1 is Iupgradable {
  using SafeMath for uint;

  Quotation public q2;
  NXMToken public tk;
  TokenController public tc;
  Pool2 public p2;
  PoolData public pd;
  Claims public c1;
  PriceFeedOracle public priceFeedOracle;
  bool public locked;

  uint public constant MCR_RATIO_DECIMALS = 4;
  uint public constant MAX_MCR_RATIO = 40000; // 400%

  uint public constant MAX_BUY_SELL_MCR_ETH_FRACTION = 500; // 5%. 4 decimal points
  uint constant CONSTANT_C = 5800000;
  uint constant CONSTANT_A = 1028 * 1e13;
  uint constant TOKEN_EXPONENT = 4;

  event Apiresult(address indexed sender, string msg, bytes32 myid);
  event Payout(address indexed to, uint coverId, uint tokens);

  event NXMSold (
    address member,
    uint nxmIn,
    uint ethOut
  );

  event NXMBought (
    address member,
    uint ethIn,
    uint nxmOut
  );


  modifier noReentrancy() {
    require(!locked, "Reentrant call.");
    locked = true;
    _;
    locked = false;
  }

  constructor(address _priceOracle) public {
    priceFeedOracle = PriceFeedOracle(_priceOracle);
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
    tk = NXMToken(ms.tokenAddress());
    tc = TokenController(ms.getLatestAddress("TC"));
    pd = PoolData(ms.getLatestAddress("PD"));
    q2 = Quotation(ms.getLatestAddress("QT"));
    p2 = Pool2(ms.getLatestAddress("P2"));
    c1 = Claims(ms.getLatestAddress("CL"));
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
    sellNXM(_amount, 0);
    success = true;
  }

  /**
   * @dev (DEPRECATED, use calculateNXMForEth function instead) Returns the amount of wei a seller will get for selling NXM
   * @param amount Amount of NXM to sell
   * @return weiToPay Amount of wei the seller will get
   */
  function getWei(uint amount) external view returns(uint weiToPay) {
    return getEthForNXM(amount);
  }

  /**
   * @dev Buys NXM tokens with ETH.
   * @param  minTokensOut Minimum amount of tokens to be bought. Revert if boughtTokens falls below this number.
   * @return boughtTokens number of bought tokens.
   */
  function buyNXM(uint minTokensOut) public payable isMember checkPause {

    uint ethIn = msg.value;
    require(ethIn > 0, "ethIn > 0");

    uint totalAssetValue = getPoolValueInEth().sub(ethIn);
    uint mcrEth = pd.getLastMCREther();
    uint mcrRatio = calculateMCRRatio(totalAssetValue, mcrEth);
    require(mcrRatio <= MAX_MCR_RATIO, "Cannot purchase if MCR% > 400%");
    uint tokensOut = calculateNXMForEth(ethIn, totalAssetValue, mcrEth);
    require(tokensOut >= minTokensOut, "tokensOut is less than minTokensOut");
    tc.mint(msg.sender, tokensOut);

    emit NXMBought(msg.sender, ethIn, tokensOut);
  }

  /**
   * @dev Sell NXM tokens and receive ETH.
   * @param tokenAmount Amount of tokens to sell.
   * @param  minEthOut Minimum amount of ETH to be received. Revert if ethOut falls below this number.
   * @return ethOut amount of ETH received in exchange for the tokens.
   */
  function sellNXM(uint tokenAmount, uint minEthOut) public isMember noReentrancy checkPause {
    require(tk.balanceOf(msg.sender) >= tokenAmount, "Pool: Not enough balance");
    require(tk.isLockedForMV(msg.sender) <= now, "Pool: NXM tokens are locked for voting");

    uint currentTotalAssetValue = getPoolValueInEth();
    uint mcrEth = pd.getLastMCREther();
    uint ethOut = calculateEthForNXM(tokenAmount, currentTotalAssetValue, mcrEth);
    require(currentTotalAssetValue.sub(ethOut) >= mcrEth, "Pool: MCR% cannot fall below 100%");
    require(ethOut >= minEthOut, "Pool: Token amount must be greater than minNXMTokensIn");

    tc.burnFrom(msg.sender, tokenAmount);
    (bool ok, /* data */) = msg.sender.call.value(ethOut)("");
    require(ok, "Pool: Sell transfer failed");
    emit NXMSold(msg.sender, tokenAmount, ethOut);
  }

  /**
 * @dev Get value in tokens for an ethAmount purchase.
 * @param ethAmount amount of ETH used for buying.
 * @return tokenValue tokens obtained by buying worth of ethAmount
 */
  function getNXMForEth(
    uint ethAmount
  ) public view returns (uint) {
    uint totalAssetValue = getPoolValueInEth();
    uint mcrEth = pd.getLastMCREther();
    return calculateNXMForEth(ethAmount, totalAssetValue, mcrEth);
  }

  function calculateNXMForEth(
    uint ethAmount,
    uint currentTotalAssetValue,
    uint mcrEth
  ) public pure returns (uint tokenValue) {
    require(
      ethAmount <= mcrEth.mul(MAX_BUY_SELL_MCR_ETH_FRACTION).div(10 ** MCR_RATIO_DECIMALS),
      "Purchases worth higher than 5% of MCReth are not allowed"
    );

    /*
      The price formula is:
      P(V) = A + MCReth / C *  MCR% ^ 4
      where MCR% = V / MCReth
      P(V) = A + 1 / (C * MCReth ^ 3) *  V ^ 4

      To compute the number of tokens issued we can integrate with respect to V the following:
        ΔT = ΔV / P(V)
        which assumes that for an infinitesimally small change in locked value V price is constant and we
        get an infinitesimally change in token supply ΔT.
     This is not computable on-chain, below we use an approximation that works well assuming
       * MCR% stays within [100%, 400%]
       * ethAmount <= 5% * MCReth

      Use a simplified formula excluding the constant A price offset to compute the amount of tokens to be minted.
      AdjustedP(V) = 1 / (C * MCReth ^ 3) *  V ^ 4
      AdjustedP(V) = 1 / (C * MCReth ^ 3) *  V ^ 4

      For a very small variation in tokens ΔT, we have,  ΔT = ΔV / P(V), to get total T we integrate with respect to V.
      adjustedTokenAmount = ∫ (dV / AdjustedP(V)) from V0 (currentTotalAssetValue) to V1 (nextTotalAssetValue)
      adjustedTokenAmount = ∫ ((C * MCReth ^ 3) / V ^ 4 * dV) from V0 to V1
      Evaluating the above using the antiderivative of the function we get:
      adjustedTokenAmount = - MCReth ^ 3 * C / (3 * V1 ^3) + MCReth * C /(3 * V0 ^ 3)
    */

    // make it at least 1 wei to avoid division by 0
    currentTotalAssetValue = currentTotalAssetValue == 0 ? 1 : currentTotalAssetValue;
    uint nextTotalAssetValue = currentTotalAssetValue.add(ethAmount);
    uint tokenPrice;

    // TODO: see if this approximation can be improved
    if (mcrEth.div(currentTotalAssetValue) > 1e12) {
      /*
       If currentTotalAssetValue is significantly less than mcrEth, MCR% approaches 0, let the price be A (baseline price).
        This avoids overflow in the calculateIntegralAtPoint computation.
        This approximation is safe from arbitrage since at MCR% < 100% no sells are possible.
      */
      tokenPrice = CONSTANT_A;
      return ethAmount.mul(1e18).div(tokenPrice);
    }

    // TODO: see if this approximation can be improved for the 0-50% MCR% interval.
    // MCReth * C /(3 * V0 ^ 3)
    uint point0 = calculateIntegralAtPoint(currentTotalAssetValue, mcrEth);
    // MCReth * C / (3 * V1 ^3)
    uint point1 = calculateIntegralAtPoint(nextTotalAssetValue, mcrEth);
    uint adjustedTokenAmount = point0.sub(point1);
    /*
      Compute a preliminary adjustedTokenPrice for the minted tokens based on the adjustedTokenAmount above,
      and to that add the A constant (the price offset previously removed in the adjusted Price formula)
      to obtain the finalPrice and ultimately the tokenValue based on the finalPrice.

      adjustedPrice = ethAmount / adjustedTokenAmount
      finalPrice = adjustedPrice + A
      tokenValue = ethAmount  / finalPrice
    */
    // ethAmount is multiplied by 1e18 to cancel out the multiplication factor of 1e18 of the adjustedTokenAmount
    uint adjustedTokenPrice = ethAmount.mul(1e18).div(adjustedTokenAmount);
    tokenPrice = adjustedTokenPrice.add(CONSTANT_A);
    return ethAmount.mul(1e18).div(tokenPrice);
  }

  /**
  * @dev integral(V) =  MCReth ^ 3 * C / (3 * V ^ 3) * 1e18
  * computation result is multiplied by 1e18 to allow for a precision of 18 decimals.
  * NOTE: omits the minus sign of the correct integral to use a uint result type for simplicity
  * WARNING: this low-level function should be called from a contract which checks that
  * mcrEth / assetValue < 1e17 (no overflow) and assetValue != 0
  */
  function calculateIntegralAtPoint(
    uint assetValue,
    uint mcrEth
  ) internal pure returns (uint) {
    return CONSTANT_C
      .mul(1e18)
      .div(3)
      .mul(mcrEth).div(assetValue)
      .mul(mcrEth).div(assetValue)
      .mul(mcrEth).div(assetValue);
  }

  function getEthForNXM(uint nxmAmount) public view returns (uint ethAmount) {
    uint currentTotalAssetValue = getPoolValueInEth();
    uint mcrEth = pd.getLastMCREther();
    return calculateEthForNXM(nxmAmount, currentTotalAssetValue, mcrEth);
  }

  /**
  * @dev Computes token sell value for a tokenAmount in ETH with a sell spread of 2.5%.
  * for values in ETH of the sale <= 1% * MCReth the sell spread is very close to the exact value of 2.5%.
  * for values higher than that sell spread may exceed 5% (The higher amount being sold at any given time the higher the spread)
  */
  function calculateEthForNXM(
    uint nxmAmount,
    uint currentTotalAssetValue,
    uint mcrEth
  ) public pure returns (uint) {

    // Step 1. Calculate spot price and amount of ETH at current values
    uint spotPrice0 = calculateTokenSpotPrice(currentTotalAssetValue, mcrEth);
    uint spotEthAmount = nxmAmount.mul(spotPrice0).div(1e18);

    //  Step 2. Calculate spot price and amount of ETH using V = currentTotalAssetValue - spotEthAmount from step 1
    uint totalValuePostSpotPriceSell = currentTotalAssetValue.sub(spotEthAmount);
    uint spotPrice1 = calculateTokenSpotPrice(totalValuePostSpotPriceSell, mcrEth);

    // Step 3. Min [average[Price(0), Price(1)] x ( 1 - Sell Spread), Price(1) ]
    // Sell Spread = 2.5%
    uint averagePriceWithSpread = spotPrice0.add(spotPrice1).div(2).mul(975).div(1000);
    uint finalPrice = averagePriceWithSpread < spotPrice1 ? averagePriceWithSpread : spotPrice1;
    uint ethAmount = finalPrice.mul(nxmAmount).div(1e18);

    require(
      ethAmount <= mcrEth.mul(MAX_BUY_SELL_MCR_ETH_FRACTION).div(10 ** MCR_RATIO_DECIMALS),
      "Pool: Sales worth more than 5% of MCReth are not allowed"
    );
    return ethAmount;
  }

  function calculateMCRRatio(uint totalAssetValue, uint mcrEth) public pure returns (uint) {
    return totalAssetValue.mul(10 ** MCR_RATIO_DECIMALS).div(mcrEth);
  }

  /**
  * @dev Calculates token price in ETH 1 NXM token. TokenPrice = A + (MCReth / C) * MCR%^4
  */
  function calculateTokenSpotPrice(
    uint totalAssetValue,
    uint mcrEth
  ) public pure returns (uint tokenPrice) {
    uint mcrRatio = calculateMCRRatio(totalAssetValue, mcrEth);
    uint precisionDecimals = 10 ** TOKEN_EXPONENT.mul(MCR_RATIO_DECIMALS);
    // TODO: can take out mul(1e18) on next and third next line, check again
    return mcrEth.mul(1e18)
      .mul(mcrRatio ** TOKEN_EXPONENT)
      .div(CONSTANT_C.mul(1e18))
      .div(precisionDecimals)
      .add(CONSTANT_A);
  }

  /**
   * @dev Calculates the Token Price of NXM in a given currency
   * with provided token supply for dynamic token price calculation
   * @param currency Currency name.
  */
  function getTokenPrice(bytes4 currency) public view returns (uint tokenPrice) {
    uint totalAssetValue = getPoolValueInEth();
    uint mcrEth = pd.getLastMCREther();
    uint tokenSpotPriceEth = calculateTokenSpotPrice(totalAssetValue, mcrEth);
    return priceFeedOracle.getCurrencyForEth(currency, tokenSpotPriceEth);
  }

    /**
   * @dev Calculates V(Tp), i.e, Pool Fund Value in Ether
   * and MCR% used in the Token Price Calculation.
   * @return vtp  Pool Fund Value in Ether used for the Token Price Model
   * @return mcrtp MCR% used in the Token Price Model.
   */
  function getPoolValueInEth() public view returns (uint) {

    uint value = address(this).balance;
    IERC20 erc20;
    uint assetTokens = 0;
    uint i;
    for (i = 1; i < pd.getAllCurrenciesLen(); i++) {
      bytes4 currency = pd.getCurrenciesByIndex(i);
      erc20 = IERC20(pd.getCurrencyAssetAddress(currency));
      assetTokens = erc20.balanceOf(address(this));
      uint rate = priceFeedOracle.getCurrencyToEthRate(currency);
      if (rate > 0) {
        value = value.add(assetTokens.mul(rate).div(1e18));
      }
    }

    return value.add(getInvestmentAssetBalance());
  }

  function getMCRRatio() public view returns (uint mcrRatio) {
    uint totalAssetValue = getPoolValueInEth();
    uint mcrEth = pd.getLastMCREther();
    mcrRatio = calculateMCRRatio(totalAssetValue, mcrEth);
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
