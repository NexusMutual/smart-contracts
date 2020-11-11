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
   * @dev Calculates the Token Price of NXM in a given currency
   * with provided token supply for dynamic token price calculation
   * @param currency Currency name.
   */
  function calculateTokenPrice(bytes4 currency) public view returns (uint tokenPrice) {
    uint totalAssetValue = p1.getPoolValueinEth();
    uint mcrEth = pd.getLastMCREther();
    uint mcrPercentage = p1.calculateMCRPercentage(totalAssetValue, mcrEth);
    uint tokenSpotPriceEth = p1.calculateTokenSpotPrice(mcrPercentage, mcrEth);
    uint currencyRate;
    (, , currencyRate) = pd.getTokenPriceDetails(currency);
    tokenPrice = tokenSpotPriceEth.mul(currencyRate).div(100);
  }

  // TODO: discuss removal/rename for this function. ONLY used in Pool2.sol in current contracts
  function calVtpAndMCRtp() public view returns (uint totalAssetValue, uint mcrPercentage) {
    totalAssetValue = p1.getPoolValueinEth();
    uint mcrEth = pd.getLastMCREther();
    mcrPercentage = p1.calculateMCRPercentage(totalAssetValue, mcrEth);
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
      vtp = p1.getPoolValueinEth();
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
