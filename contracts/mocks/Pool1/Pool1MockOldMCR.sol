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
import "./Pool1MockOldPool1.sol";
import "../../modules/cover/QuotationData.sol";
import "../../modules/governance/MemberRoles.sol";
import "../../modules/governance/ProposalCategory.sol";
import "../../modules/token/NXMToken.sol";
import "../../modules/token/TokenData.sol";
import "../../modules/capital/PoolData.sol";

contract Pool1MockOldMCR is Iupgradable {
  using SafeMath for uint;

  Pool1MockOldPool1 internal p1;
  PoolData internal pd;
  NXMToken internal tk;
  QuotationData internal qd;
  MemberRoles internal mr;
  TokenData internal td;
  ProposalCategory internal proposalCategory;

  uint private constant DECIMAL1E18 = uint(10) ** 18;
  uint private constant DECIMAL1E05 = uint(10) ** 5;
  uint private constant DECIMAL1E19 = uint(10) ** 19;
  uint private constant minCapFactor = uint(10) ** 21;

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
   * @dev Iupgradable Interface to update dependent contract address
   */
  function changeDependentContractAddress() public {
    qd = QuotationData(ms.getLatestAddress("QD"));
    p1 = Pool1MockOldPool1(ms.getLatestAddress("P1"));
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
   * @dev Calculates V(Tp) and MCR%(Tp), i.e, Pool Fund Value in Ether
   * and MCR% used in the Token Price Calculation.
   * @return vtp  Pool Fund Value in Ether used for the Token Price Model
   * @return mcrtp MCR% used in the Token Price Model.
   */
  function _calVtpAndMCRtp(uint poolBalance) public view returns (uint vtp, uint mcrtp) {
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
    uint mcrFullperc;
    uint vFull;
    (mcrFullperc, , vFull,) = pd.getLastMCR();
    if (vFull > 0) {
      mcrtp = (mcrFullperc.mul(vtp)).div(vFull);
    }
  }

  /**
   * @dev Calculates the Token Price of NXM in a given currency.
   * @param curr Currency name.

   */
  function calculateStepTokenPrice(
    bytes4 curr,
    uint mcrtp
  )
  public
  view
  onlyInternal
  returns (uint tokenPrice)
  {
    return _calculateTokenPrice(curr, mcrtp);
  }

  /**
   * @dev Calculates the Token Price of NXM in a given currency
   * with provided token supply for dynamic token price calculation
   * @param curr Currency name.
   */
  function calculateTokenPrice(bytes4 curr) public view returns (uint tokenPrice) {
    uint mcrtp;
    (, mcrtp) = _calVtpAndMCRtp(address(p1).balance);
    return _calculateTokenPrice(curr, mcrtp);
  }

  function calVtpAndMCRtp() public view returns (uint vtp, uint mcrtp) {
    return _calVtpAndMCRtp(address(p1).balance);
  }

  function calculateVtpAndMCRtp(uint poolBalance) public view returns (uint vtp, uint mcrtp) {
    return _calVtpAndMCRtp(poolBalance);
  }

  /**
   * @dev Gets max numbers of tokens that can be sold at the moment.
   */
  function getMaxSellTokens() public view returns (uint maxTokens) {
    uint baseMin = pd.getCurrencyAssetBaseMin("ETH");
    uint maxTokensAccPoolBal;
    if (address(p1).balance > baseMin.mul(50).div(100)) {
      maxTokensAccPoolBal = address(p1).balance.sub(
        (baseMin.mul(50)).div(100));
    }
    maxTokensAccPoolBal = (maxTokensAccPoolBal.mul(DECIMAL1E18)).div(
      (calculateTokenPrice("ETH").mul(975)).div(1000));
    uint lastMCRPerc = pd.getLastMCRPerc();
    if (lastMCRPerc > 10000)
      maxTokens = (((uint(lastMCRPerc).sub(10000)).mul(2000)).mul(DECIMAL1E18)).div(10000);
    if (maxTokens > maxTokensAccPoolBal)
      maxTokens = maxTokensAccPoolBal;
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
    uint getA;
    uint getC;
    uint getCAAvgRate;
    uint tokenExponentValue = td.tokenExponent();
    // uint max = (mcrtp.mul(mcrtp).mul(mcrtp).mul(mcrtp));
    uint max = mcrtp ** tokenExponentValue;
    uint dividingFactor = tokenExponentValue.mul(4);
    (getA, getC, getCAAvgRate) = pd.getTokenPriceDetails(_curr);
    uint mcrEth = pd.getLastMCREther();
    getC = getC.mul(DECIMAL1E18);
    tokenPrice = (mcrEth.mul(DECIMAL1E18).mul(max).div(getC)).div(10 ** dividingFactor);
    tokenPrice = tokenPrice.add(getA.mul(DECIMAL1E18).div(DECIMAL1E05));
    tokenPrice = tokenPrice.mul(getCAAvgRate * 10);
    tokenPrice = (tokenPrice).div(10 ** 3);
  }
}
