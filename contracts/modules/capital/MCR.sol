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
import "../capital/Pool.sol";
import "../cover/QuotationData.sol";
import "../oracles/PriceFeedOracle.sol";
import "../token/NXMToken.sol";
import "../token/TokenData.sol";
import "hardhat/console.sol";
import "./LegacyMCR.sol";

contract MCR is Iupgradable {
  using SafeMath for uint;

  Pool public pool;
  QuotationData public qd;
  uint96 _unused;

  uint256 constant UINT24_MAX = ~uint24(0);

  uint24 public mcrFloorIncrementThreshold = 13000;
  uint24 public maxMCRFloorIncrement = 100;
  uint24 public maxMCRIncrement = 500;
  uint24 public gearingFactor = 48000;
  uint24 public minUpdateTime = 3600;
  uint112 public mcrFloor;

  uint112 public mcr;
  uint112 public desiredMCR;
  uint32 public lastUpdateTime = 0;

  event MCRUpdated(
    uint mcr,
    uint mcrFloor,
    uint mcrETHWithGear,
    uint totalSumAssured,
    uint timestamp
  );

  constructor (address masterAddress) public {

    changeMasterAddress(masterAddress);

    // we'll pass the zero address on the first deploy
    // due to missing previous MCR contract
    if (masterAddress == address(0)) {
      return;
    }

    address mcrAddress = ms.getLatestAddress("MC");
    LegacyMCR previousMCR = LegacyMCR(mcrAddress);

    // fetch MCR parameters from previous contract
    mcrFloor = uint112(previousMCR.variableMincap());
    mcr = uint112(previousMCR.getLastMCREther());
    mcrFloorIncrementThreshold = uint24(previousMCR.dynamicMincapThresholdx100());
    maxMCRFloorIncrement = uint24(previousMCR.dynamicMincapIncrementx100());

    // set last updated time to now
    lastUpdateTime = uint32(now);
  }

  /**
   * @dev Iupgradable Interface to update dependent contract address
   */
  function changeDependentContractAddress() public {
    qd = QuotationData(ms.getLatestAddress("QD"));
    pool = Pool(ms.getLatestAddress("P1"));
  }

  /**
   * @dev Gets total sum assured (in ETH).
   * @return amount of sum assured
   */
  function getAllSumAssurance() public view returns (uint) {

    PriceFeedOracle priceFeed = pool.priceFeedOracle();
    address daiAddress = priceFeed.daiAddress();

    uint ethAmount = qd.getTotalSumAssured("ETH").mul(1e18);
    uint daiAmount = qd.getTotalSumAssured("DAI").mul(1e18);

    uint daiRate = priceFeed.getAssetToEthRate(daiAddress);
    uint daiAmountInEth = daiAmount.mul(daiRate).div(1e18);

    return ethAmount.add(daiAmountInEth);
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
      val = uint(mcrFloorIncrementThreshold);

    } else if (code == "DMCI") {
      val = uint(maxMCRFloorIncrement);
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

      require(val <= UINT24_MAX, "MCR: DMCT value too large");
      mcrFloorIncrementThreshold = uint24(val);

    } else if (code == "DMCI") {

      require(val <= UINT24_MAX, "MCR: DMCI value too large");
      maxMCRFloorIncrement = uint24(val);

    }
    else {
      revert("Invalid param code");
    }

  }

  function updateMCR(uint poolValueInEth) external onlyInternal {

    if (lastUpdateTime + minUpdateTime > now) {
      return;
    }
    if (pool.calculateMCRRatio(poolValueInEth, mcr) > mcrFloorIncrementThreshold) {
      uint percentageAdjustment = (now - lastUpdateTime).mul(10000).div(1 days).mul(maxMCRFloorIncrement).div(10000);
      mcrFloor = uint112(uint(mcrFloor).mul(percentageAdjustment.add(10000)).div(10000));
    }

    uint totalSumAssured = getAllSumAssurance();

    uint mcrETHWithGear = totalSumAssured.mul(10000).div(gearingFactor);

    uint desiredMCREth = max(mcrETHWithGear, mcrFloor);
    uint maxPercentageAdjustment = (now - lastUpdateTime).mul(10000).div(1 days).mul(maxMCRIncrement).div(10000);
    maxPercentageAdjustment = min(maxPercentageAdjustment, 100);

    if (desiredMCREth > mcr) {
      mcr = uint112(min(uint(mcr).mul(maxPercentageAdjustment.add(10000)).div(10000), desiredMCREth));
    }
    if (desiredMCREth < mcr) {
      mcr = uint112(max(uint(mcr).mul(10000 - maxPercentageAdjustment).div(10000), desiredMCREth));
    }
    lastUpdateTime = uint32(now);
    emit MCRUpdated(mcr, mcrFloor, mcrETHWithGear, totalSumAssured, lastUpdateTime);
  }

  function getMCR() public view returns (uint) {
    return mcr;
  }

  function min(uint x, uint y) pure internal returns (uint) {
    return x < y ? x : y;
  }

  function max(uint x, uint y) pure internal returns (uint) {
    return x > y ? x : y;
  }
}
