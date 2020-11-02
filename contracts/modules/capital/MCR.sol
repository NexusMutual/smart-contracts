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
import "../capital/Pool1.sol";
import "../cover/QuotationData.sol";
import "../governance/MemberRoles.sol";
import "../governance/ProposalCategory.sol";
import "../token/NXMToken.sol";
import "../token/TokenData.sol";
import "./PoolData.sol";

contract MCR is Iupgradable {
  using SafeMath for uint;

  Pool1 public p1;
  PoolData public pd;
  NXMToken public tk;
  QuotationData public qd;
  MemberRoles public mr;
  TokenData public td;
  ProposalCategory public proposalCategory;

  uint private constant minCapFactor = uint(10) ** 21;
  uint public constant SELL_SPREAD = 25;
  uint public constant MAX_BUY_SELL_MCR_ETH_PERCENTAGE = 5;
  uint public constant MAX_MCR_PERCENTAGE = 4 * MCR_PERCENTAGE_MULTIPLIER; // 400%
  uint public constant MCR_PERCENTAGE_DECIMALS = 4;
  uint public constant MCR_PERCENTAGE_MULTIPLIER = 10 ** MCR_PERCENTAGE_DECIMALS;
  uint constant CONSTANT_C = 5800000;
  uint constant CONSTANT_A = 1028;
  uint constant TOKEN_EXPONENT = 4;

  uint public variableMincap;
  uint public dynamicMincapThresholdx100 = 13000;
  uint public dynamicMincapIncrementx100 = 100;

  event MCREvent(
    uint indexed date,
    uint blockNumber,
    bytes4[] allCurr,
    uint[] allCurrRates,
    uint mcrEtherx100,
    uint mcrPercx100,
    uint vFull
  );

  /**
   * @dev Adds new MCR data.
   * @param mcrP  Minimum Capital Requirement in percentage.
   * @param vF Pool1 fund value in Ether used in the last full daily calculation of the Capital model.
   * @param onlyDate  Date(yyyymmdd) at which MCR details are getting added.
   */
  function addMCRData(
    uint mcrP,
    uint mcrE,
    uint vF,
    bytes4[] calldata curr,
    uint[] calldata _threeDayAvg,
    uint64 onlyDate
  )
  external
  checkPause
  {
    require(proposalCategory.constructorCheck());
    require(pd.isnotarise(msg.sender));
    if (mr.launched() && pd.capReached() != 1) {

      if (mcrP >= 10000)
        pd.setCapReached(1);

    }
    uint len = pd.getMCRDataLength();
    _addMCRData(len, onlyDate, curr, mcrE, mcrP, vF, _threeDayAvg);
  }

  /**
   * @dev Adds MCR Data for last failed attempt.
   */
  function addLastMCRData(uint64 date) external checkPause onlyInternal {
    uint64 lastdate = uint64(pd.getLastMCRDate());
    uint64 failedDate = uint64(date);
    if (failedDate >= lastdate) {
      uint mcrP;
      uint mcrE;
      uint vF;
      (mcrP, mcrE, vF,) = pd.getLastMCR();
      uint len = pd.getAllCurrenciesLen();
      pd.pushMCRData(mcrP, mcrE, vF, date);
      for (uint j = 0; j < len; j++) {
        bytes4 currName = pd.getCurrenciesByIndex(j);
        pd.updateCAAvgRate(currName, pd.getCAAvgRate(currName));
      }

      emit MCREvent(date, block.number, new bytes4[](0), new uint[](0), mcrE, mcrP, vF);
      // Oraclize call for next MCR calculation
      _callOracliseForMCR();
    }
  }

  /**
   * @dev Iupgradable Interface to update dependent contract address
   */
  function changeDependentContractAddress() public {
    qd = QuotationData(ms.getLatestAddress("QD"));
    p1 = Pool1(ms.getLatestAddress("P1"));
    pd = PoolData(ms.getLatestAddress("PD"));
    tk = NXMToken(ms.tokenAddress());
    mr = MemberRoles(ms.getLatestAddress("MR"));
    td = TokenData(ms.getLatestAddress("TD"));
    proposalCategory = ProposalCategory(ms.getLatestAddress("PC"));
  }

  /**
   * @dev Gets total sum assured(in ETH).
   * @return amount of sum assured
   */
  function getAllSumAssurance() public view returns (uint amount) {
    uint len = pd.getAllCurrenciesLen();
    for (uint i = 0; i < len; i++) {
      bytes4 currName = pd.getCurrenciesByIndex(i);
      if (currName == "ETH") {
        amount = amount.add(qd.getTotalSumAssured(currName));
      } else {
        if (pd.getCAAvgRate(currName) > 0)
          amount = amount.add((qd.getTotalSumAssured(currName).mul(100)).div(pd.getCAAvgRate(currName)));
      }
    }
  }

  /**
   * @dev Calculates V(Tp), i.e, Pool Fund Value in Ether
   * and MCR% used in the Token Price Calculation.
   * @return vtp  Pool Fund Value in Ether used for the Token Price Model
   * @return mcrtp MCR% used in the Token Price Model.
   */
  function getTotalAssetValue(uint poolBalance) public view returns (uint vtp) {
    vtp = 0;
    IERC20 erc20;
    uint currTokens = 0;
    uint i;
    for (i = 1; i < pd.getAllCurrenciesLen(); i++) {
      bytes4 currency = pd.getCurrenciesByIndex(i);
      erc20 = IERC20(pd.getCurrencyAssetAddress(currency));
      currTokens = erc20.balanceOf(address(p1));
      if (pd.getCAAvgRate(currency) > 0)
        vtp = vtp.add((currTokens.mul(100)).div(pd.getCAAvgRate(currency)));
    }

    vtp = vtp.add(poolBalance).add(p1.getInvestmentAssetBalance());
  }

  /**
  * @dev Get value in tokens for an ethAmount purchase.
  * @param poolBalance ETH balance of Pool1
  * @param ethAmount amount of ETH used for buying.
  * @return tokenValue tokens obtained by buying worth of ethAmount
  */
  function getTokenBuyValue(
    uint poolBalance,
    uint ethAmount
  ) public view returns (uint tokenValue) {

    uint totalAssetValue = getTotalAssetValue(poolBalance);
    uint mcrEth = pd.getLastMCREther();
    uint mcrPercentage = calculateMCRPercentage(totalAssetValue, mcrEth);

    require(mcrPercentage <= MAX_MCR_PERCENTAGE, "Cannot purchase if MCR% > 400%");
    tokenValue = calculateTokenBuyValue(ethAmount, totalAssetValue, mcrEth);
  }

  function calculateTokenBuyValue(
    uint ethAmount,
    uint currentTotalAssetValue,
    uint mcrEth
  ) public pure returns (uint tokenValue) {
    require(
      ethAmount <= mcrEth.mul(MAX_BUY_SELL_MCR_ETH_PERCENTAGE).div(100),
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
    uint nextTotalAssetValue = currentTotalAssetValue.add(ethAmount);

    // MCReth * C /(3 * V0 ^ 3)
    uint point0 = antiderivative(currentTotalAssetValue, mcrEth);
    // MCReth * C / (3 * V1 ^3)
    uint point1 = antiderivative(nextTotalAssetValue, mcrEth);
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
    uint tokenPrice = adjustedTokenPrice.add(CONSTANT_A.mul(1e13));
    tokenValue = ethAmount.mul(1e18).div(tokenPrice);
  }

  /**
  * @dev antiderivative(V) =  MCReth ^ 3 * C / (3 * V ^ 3) * 1e18
  * computation result is multiplied by 1e18 to allow for a precision of 18 decimals.
  * NOTE: omits the minus sign of the correct antiderivative to use a uint result type for simplicity
  */
  function antiderivative(
    uint assetValue,
    uint mcrEth
  ) internal pure returns (uint result) {
    result = mcrEth.mul(CONSTANT_C).mul(1e18).div(TOKEN_EXPONENT.sub(1)).div(assetValue);

    for (uint i = 0; i < TOKEN_EXPONENT.sub(2); i++) {
      result = result.mul(mcrEth).div(assetValue);
    }
  }

  function getTokenSellValue(uint tokenAmount) public view returns (uint ethValue) {
    uint currentTotalAssetValue = getTotalAssetValue(address(p1).balance);
    uint mcrEth = pd.getLastMCREther();

    ethValue = calculateTokenSellValue(tokenAmount, currentTotalAssetValue, mcrEth);
  }

  /**
  * @dev Computes token sell value for a tokenAmount in ETH with a sell spread SELL_SPREAD.
  * for values in ETH of the sale <= 1% * MCReth the sell spread is very close to the exact value of SELL_SPREAD.
  * for values higher than that sell spread may exceed 5% (The higher amount being sold at any given time the higher the spread)
  */
  function calculateTokenSellValue(
    uint tokenAmount,
    uint currentTotalAssetValue,
    uint mcrEth
  ) public pure returns (uint ethValue) {

    // Step 1. Calculate spot price and amount of ETH at current values
    uint mcrPercentage0 = currentTotalAssetValue.mul(MCR_PERCENTAGE_MULTIPLIER).div(mcrEth);
    uint spotPrice0 = calculateTokenSpotPrice(mcrPercentage0, mcrEth);
    uint spotEthAmount = tokenAmount.mul(spotPrice0).div(1e18);

    //  Step 2. Calculate spot price and amount of ETH using V = currentTotalAssetValue - spotEthAmount from step 1
    uint totalValuePostSpotPriceSell = currentTotalAssetValue.sub(spotEthAmount);
    uint mcrPercentagePostSpotPriceSell = totalValuePostSpotPriceSell.mul(MCR_PERCENTAGE_MULTIPLIER).div(mcrEth);
    uint spotPrice1 = calculateTokenSpotPrice(mcrPercentagePostSpotPriceSell, mcrEth);

     // Step 3. Min [average[Price(1), Price(2)] x ( 1 - Sell Spread), Price(2) ]
    uint averagePriceWithSpread = spotPrice0.add(spotPrice1).div(2).mul(1000 - SELL_SPREAD).div(1000);
    uint finalPrice = averagePriceWithSpread < spotPrice1 ? averagePriceWithSpread : spotPrice1;
    ethValue = finalPrice.mul(tokenAmount).div(1e18);

    require(
      ethValue <= mcrEth.mul(MAX_BUY_SELL_MCR_ETH_PERCENTAGE).div(100),
      "Sales worth higher than 5% of MCR eth are not allowed"
    );
  }

  function calculateMCRPercentage(uint totalAssetValue, uint mcrEth) public pure returns (uint) {
    return totalAssetValue.mul(MCR_PERCENTAGE_MULTIPLIER).div(mcrEth);
  }

  function calculateTokenSpotPrice(
    uint mcrPercentage,
    uint mcrEth
  ) public pure returns (uint tokenPrice) {
    uint max = mcrPercentage ** TOKEN_EXPONENT;
    uint dividingFactor = TOKEN_EXPONENT.mul(MCR_PERCENTAGE_DECIMALS);
    tokenPrice = (mcrEth.mul(1e18).mul(max).div(CONSTANT_C.mul(1e18))).div(10 ** dividingFactor);
    tokenPrice = tokenPrice.add(CONSTANT_A.mul(1e13));
  }

  /**
   * @dev Calculates the Token Price of NXM in a given currency
   * with provided token supply for dynamic token price calculation
   * @param currency Currency name.
   */
  function calculateTokenPrice(bytes4 currency) public view returns (uint tokenPrice) {
    uint totalAssetValue = getTotalAssetValue(address(p1).balance);
    uint mcrEth = pd.getLastMCREther();
    uint mcrPercentage = calculateMCRPercentage(totalAssetValue, mcrEth);
    return _calculateTokenPrice(currency, mcrPercentage);
  }

  // TODO: discuss removal/rename for this function. ONLY used in Pool2.sol in current contracts
  function calVtpAndMCRtp() public view returns (uint totalAssetValue, uint mcrPercentage) {
    totalAssetValue = getTotalAssetValue(address(p1).balance);
    uint mcrEth = pd.getLastMCREther();
    mcrPercentage = calculateMCRPercentage(totalAssetValue, mcrEth);
  }

  function getThresholdValues(uint vtp, uint vF, uint totalSA, uint minCap) public view returns (uint lowerThreshold, uint upperThreshold)
  {
    minCap = (minCap.mul(minCapFactor)).add(variableMincap);
    uint lower = 0;
    if (vtp >= vF) {
      // Max Threshold = [MAX(Vtp, Vfull) x 120] / mcrMinCap
      upperThreshold = vtp.mul(120).mul(100).div((minCap));
    } else {
      upperThreshold = vF.mul(120).mul(100).div((minCap));
    }

    if (vtp > 0) {
      lower = totalSA.mul(1e18).mul(pd.shockParameter()).div(100);
      if (lower < minCap.mul(11).div(10))
        lower = minCap.mul(11).div(10);
    }
    if (lower > 0) {
      // Min Threshold = [Vtp / MAX(TotalActiveSA x ShockParameter, mcrMinCap x 1.1)] x 100
      lowerThreshold = vtp.mul(100).mul(100).div(lower);
    }
  }

  /**
   * @dev Gets Uint Parameters of a code
   * @param code whose details we want
   * @return string value of the code
   * @return associated amount (time or perc or value) to the code
   */
  function getUintParameters(bytes8 code) external view returns (bytes8 codeVal, uint val) {
    codeVal = code;
    if (code == "DMCT") {
      val = dynamicMincapThresholdx100;

    } else if (code == "DMCI") {

      val = dynamicMincapIncrementx100;

    }

  }

  /**
   * @dev Updates Uint Parameters of a code
   * @param code whose details we want to update
   * @param val value to set
   */
  function updateUintParameters(bytes8 code, uint val) public {
    require(ms.checkIsAuthToGoverned(msg.sender));
    if (code == "DMCT") {
      dynamicMincapThresholdx100 = val;

    } else if (code == "DMCI") {

      dynamicMincapIncrementx100 = val;

    }
    else {
      revert("Invalid param code");
    }

  }

  /**
   * @dev Calls oraclize query to calculate MCR details after 24 hours.
   */
  function _callOracliseForMCR() internal {
    p1.mcrOraclise(pd.mcrTime());
  }

  /**
   * @dev Calculates the Token Price of NXM in a given currency
   * with provided token supply for dynamic token price calculation
   * @param _curr Currency name.
   * @return tokenPrice Token price.
   */
  function _calculateTokenPrice(
    bytes4 _curr,
    uint mcrtp
  )
  internal
  view
  returns (uint tokenPrice)
  {
    // TODO: refactor this
    uint getA;
    uint getC;
    uint getCAAvgRate;
    uint tokenExponentValue = td.tokenExponent();
    // uint max = (mcrtp.mul(mcrtp).mul(mcrtp).mul(mcrtp));
    uint max = mcrtp ** tokenExponentValue;
    uint dividingFactor = tokenExponentValue.mul(4);
    (getA, getC, getCAAvgRate) = pd.getTokenPriceDetails(_curr);
    uint mcrEth = pd.getLastMCREther();
    getC = getC.mul(1e18);
    tokenPrice = (mcrEth.mul(1e18).mul(max).div(getC)).div(10 ** dividingFactor);
    tokenPrice = tokenPrice.add(getA.mul(1e18).div(1e5));
    tokenPrice = tokenPrice.mul(getCAAvgRate * 10);
    tokenPrice = (tokenPrice).div(10 ** 3);
  }

  /**
   * @dev Adds MCR Data. Checks if MCR is within valid
   * thresholds in order to rule out any incorrect calculations
   */
  function _addMCRData(
    uint len,
    uint64 newMCRDate,
    bytes4[] memory curr,
    uint mcrE,
    uint mcrP,
    uint vF,
    uint[] memory _threeDayAvg
  )
  internal
  {
    uint vtp = 0;
    uint lowerThreshold = 0;
    uint upperThreshold = 0;
    if (len > 1) {
      vtp = getTotalAssetValue(address(p1).balance);
      (lowerThreshold, upperThreshold) = getThresholdValues(vtp, vF, getAllSumAssurance(), pd.minCap());

    }
    if (mcrP > dynamicMincapThresholdx100)
      variableMincap = (variableMincap.mul(dynamicMincapIncrementx100.add(10000)).add(minCapFactor.mul(pd.minCap().mul(dynamicMincapIncrementx100)))).div(10000);


    // Explanation for above formula :-
    // actual formula -> variableMinCap =  variableMinCap + (variableMinCap+minCap)*dynamicMincapIncrement/100
    // Implemented formula is simplified form of actual formula.
    // Let consider above formula as b = b + (a+b)*c/100
    // here, dynamicMincapIncrement is in x100 format.
    // so b+(a+b)*cx100/10000 can be written as => (10000.b + b.cx100 + a.cx100)/10000.
    // It can further simplify to (b.(10000+cx100) + a.cx100)/10000.
    if (len == 1 || (mcrP) >= lowerThreshold
    && (mcrP) <= upperThreshold) {
      // due to stack to deep error,we are reusing already declared variable
      vtp = pd.getLastMCRDate();
      pd.pushMCRData(mcrP, mcrE, vF, newMCRDate);
      for (uint i = 0; i < curr.length; i++) {
        pd.updateCAAvgRate(curr[i], _threeDayAvg[i]);
      }
      emit MCREvent(newMCRDate, block.number, curr, _threeDayAvg, mcrE, mcrP, vF);
      // Oraclize call for next MCR calculation
      if (vtp < newMCRDate) {
        _callOracliseForMCR();
      }
    } else {
      p1.mcrOracliseFail(newMCRDate, pd.mcrFailTime());
    }
  }

}
