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
import "hardhat/console.sol";

contract MCR is Iupgradable {
  using SafeMath for uint;

  Pool public pool;
  QuotationData public qd;
  // sizeof(qd) + 96 = 160 + 96 = 256 (occupies entire slot)
  uint96 _unused;

  uint24 public mcrFloorIncrementThreshold = 13000;
  uint24 public maxMCRFloorIncrement = 100;
  uint24 public maxMCRIncrement = 500;
  uint24 public gearingFactor = 48000;
  uint24 public minUpdateTime = 3600;
  uint112 public mcrFloor;

  uint112 public mcr;
  uint112 public desiredMCR;
  uint32 public lastUpdateTime = 0;

  LegacyMCR public previousMCR;

  event MCRUpdated(
    uint mcr,
    uint mcrFloor,
    uint desiredMCR,
    uint mcrETHWithGear,
    uint totalSumAssured,
    uint timestamp
  );

  uint256 constant UINT24_MAX = ~uint24(0);
  uint256 constant MAX_PERCENTAGE_ADJUSTMENT = 100;

  constructor (address masterAddress) public {
    changeMasterAddress(masterAddress);

    if (masterAddress != address(0)) {
      previousMCR = LegacyMCR(ms.getLatestAddress("MC"));
    }
  }

  /**
   * @dev Iupgradable Interface to update dependent contract address
   */
  function changeDependentContractAddress() public {
    qd = QuotationData(ms.getLatestAddress("QD"));
    pool = Pool(ms.getLatestAddress("P1"));
    initialize();
  }

  function initialize() internal {

    if (address(previousMCR) == address(0)) {
      // already initialized or no previousMCR available
      return;
    }

    // fetch MCR parameters from previous contract
    mcrFloor = uint112(previousMCR.variableMincap());
    mcr = uint112(previousMCR.getLastMCREther());
    desiredMCR = mcr;
    mcrFloorIncrementThreshold = uint24(previousMCR.dynamicMincapThresholdx100());
    maxMCRFloorIncrement = uint24(previousMCR.dynamicMincapIncrementx100());

    // set last updated time to now
    lastUpdateTime = uint32(now);
    previousMCR = LegacyMCR(address(0));
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
   * @dev Updates Uint Parameters of a code
   * @param code whose details we want to update
   * @param val value to set
   */
  function updateUintParameters(bytes8 code, uint val) public {
    require(ms.checkIsAuthToGoverned(msg.sender));
    if (code == "DMCT") {

      require(val <= UINT24_MAX, "MCR: value too large");
      mcrFloorIncrementThreshold = uint24(val);

    } else if (code == "DMCI") {

      require(val <= UINT24_MAX, "MCR: value too large");
      maxMCRFloorIncrement = uint24(val);

    } else if (code == "MMIC") {

      require(val <= UINT24_MAX, "MCR: value too large");
      maxMCRIncrement = uint24(val);

    } else if (code == "GEAR") {

      require(val <= UINT24_MAX, "MCR: value too large");
      gearingFactor = uint24(val);

    } else if (code == "MUTI") {

      require(val <= UINT24_MAX, "MCR: value too large");
      minUpdateTime = uint24(val);

    } else {
      revert("Invalid param code");
    }
  }

  /*
  * @dev trigger an MCR update. Current virtual MCR value is synced to storage, mcrFloor is potentially updated
  * and a new desiredMCR value to move towards is set.
  *
  */
  function updateMCR() public {
    _updateMCR(pool.getPoolValueInEth(), false);
  }

  function updateMCRInternal(uint poolValueInEth, bool forceUpdate) public onlyInternal {
    _updateMCR(poolValueInEth, forceUpdate);
  }

  function _updateMCR(uint poolValueInEth, bool forceUpdate) internal {

    (uint24 mcrFloorIncrementThreshold,
    uint24 maxMCRFloorIncrement,
    uint24 maxMCRIncrement,
    uint24 gearingFactor,
    uint24 minUpdateTime,
    uint112 currentMCRFloor ) = (mcrFloorIncrementThreshold, maxMCRFloorIncrement, maxMCRIncrement, gearingFactor, minUpdateTime, mcrFloor);
    (uint112 currentMCR,
    /* uint112 desiredMCR */,
    uint32 lastUpdateTime
    ) = (mcr, desiredMCR, lastUpdateTime);
    if (!forceUpdate && lastUpdateTime + minUpdateTime > now) {
      return;
    }
    if (pool.calculateMCRRatio(poolValueInEth, currentMCR) >= mcrFloorIncrementThreshold) {
        // MCR floor updates by up to maxMCRFloorIncrement percentage per day whenever the MCR ratio exceeds 1.3
        // MCR floor is monotonically increasing.
      uint percentageAdjustment = (now - lastUpdateTime).mul(10000).div(1 days).mul(maxMCRFloorIncrement).div(10000);
      mcrFloor = uint112(uint(currentMCRFloor).mul(percentageAdjustment.add(10000)).div(10000));
    }

    uint totalSumAssured = getAllSumAssurance();

    uint mcrWithGear = totalSumAssured.mul(10000).div(gearingFactor);
    // sync the current virtual MCR value to storage
    mcr = uint112(getMCR());

    // the desiredMCR cannot fall below the mcrFloor but may have a higher or lower target value based
    // on the changes in the totalSumAssured in the system.
    desiredMCR = uint112(max(mcrWithGear, mcrFloor));
    lastUpdateTime = uint32(now);

    emit MCRUpdated(mcr, mcrFloor, desiredMCR, mcrWithGear, totalSumAssured, lastUpdateTime);
  }

  /**
   * @dev Calculates the current virtual MCR value. The virtual MCR value moves towards the desiredMCR value away
   * from the stored mcr value at constant velocity based on how much time passed from the lastUpdateTime.
   * The total change in virtual MCR cannot exceed 1% of stored mcr.
   *
   * This approach allows for the MCR to change smoothly across time without sudden jumps between values, while
   * always progressing towards the desiredMCR goal. The desiredMCR can change subject to the call of _updateMCR
   * so the virtual MCR value may change direction and start decreasing instead of increasing or vice-versa.
   *
   * @return mcr
   */
  function getMCR() public view returns (uint) {
    (uint112 mcr,
    uint112 desiredMCR,
    uint32 lastUpdateTime
    ) = (mcr, desiredMCR, lastUpdateTime);

    uint percentageAdjustment = (now - lastUpdateTime).mul(10000).div(1 days).mul(maxMCRIncrement).div(10000);
    percentageAdjustment = min(percentageAdjustment, MAX_PERCENTAGE_ADJUSTMENT);

    if (desiredMCR > mcr) {
      return min(uint(mcr).mul(percentageAdjustment.add(10000)).div(10000), desiredMCR);
    }

    // in case desiredMCR <= mcr
    return max(uint(mcr).mul(10000 - percentageAdjustment).div(10000), desiredMCR);
  }

  function min(uint x, uint y) pure internal returns (uint) {
    return x < y ? x : y;
  }

  function max(uint x, uint y) pure internal returns (uint) {
    return x > y ? x : y;
  }
}
