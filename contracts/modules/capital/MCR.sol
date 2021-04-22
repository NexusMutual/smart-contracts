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
import "./LegacyMCR.sol";

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
  uint32 public lastUpdateTime;

  LegacyMCR public previousMCR;

  event MCRUpdated(
    uint mcr,
    uint desiredMCR,
    uint mcrFloor,
    uint mcrETHWithGear,
    uint totalSumAssured
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

    address currentMCR = ms.getLatestAddress("MC");

    if (address(previousMCR) == address(0) || currentMCR != address(this)) {
      // already initialized or not ready for initialization
      return;
    }

    // fetch MCR parameters from previous contract
    uint112 minCap = 7000 * 1e18;
    mcrFloor = uint112(previousMCR.variableMincap()) + minCap;
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

    // read with 1 SLOAD
    uint _mcrFloorIncrementThreshold = mcrFloorIncrementThreshold;
    uint _maxMCRFloorIncrement = maxMCRFloorIncrement;
    uint _gearingFactor = gearingFactor;
    uint _minUpdateTime = minUpdateTime;
    uint _mcrFloor =  mcrFloor;

    // read with 1 SLOAD
    uint112 _mcr = mcr;
    uint112 _desiredMCR = desiredMCR;
    uint32 _lastUpdateTime = lastUpdateTime;

    if (!forceUpdate && _lastUpdateTime + _minUpdateTime > now) {
      return;
    }

    if (now > _lastUpdateTime && pool.calculateMCRRatio(poolValueInEth, _mcr) >= _mcrFloorIncrementThreshold) {
        // MCR floor updates by up to maxMCRFloorIncrement percentage per day whenever the MCR ratio exceeds 1.3
        // MCR floor is monotonically increasing.
      uint percentageAdjustment = min(
        _maxMCRFloorIncrement.mul(now - _lastUpdateTime).div(1 days),
        _maxMCRFloorIncrement
      );
      uint newMCRFloor = _mcrFloor.mul(percentageAdjustment.add(10000)).div(10000);
      require(newMCRFloor <= uint112(~0), 'MCR: newMCRFloor overflow');

      mcrFloor = uint112(newMCRFloor);
    }

    // sync the current virtual MCR value to storage
    uint112 newMCR = uint112(getMCR());
    if (newMCR != _mcr) {
      mcr = newMCR;
    }

    // the desiredMCR cannot fall below the mcrFloor but may have a higher or lower target value based
    // on the changes in the totalSumAssured in the system.
    uint totalSumAssured = getAllSumAssurance();
    uint gearedMCR = totalSumAssured.mul(10000).div(_gearingFactor);
    uint112 newDesiredMCR = uint112(max(gearedMCR, mcrFloor));
    if (newDesiredMCR != _desiredMCR) {
      desiredMCR = newDesiredMCR;
    }

    lastUpdateTime = uint32(now);

    emit MCRUpdated(mcr, desiredMCR, mcrFloor, gearedMCR, totalSumAssured);
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

    // read with 1 SLOAD
    uint _mcr = mcr;
    uint _desiredMCR = desiredMCR;
    uint _lastUpdateTime = lastUpdateTime;


    if (now == _lastUpdateTime) {
      return _mcr;
    }

    uint _maxMCRIncrement = maxMCRIncrement;

    uint percentageAdjustment = _maxMCRIncrement.mul(now - _lastUpdateTime).div(1 days);
    percentageAdjustment = min(percentageAdjustment, MAX_PERCENTAGE_ADJUSTMENT);

    if (_desiredMCR > _mcr) {
      return min(_mcr.mul(percentageAdjustment.add(10000)).div(10000), _desiredMCR);
    }

    // in case desiredMCR <= mcr
    return max(_mcr.mul(10000 - percentageAdjustment).div(10000), _desiredMCR);
  }

  function getGearedMCR() external view returns (uint) {
    return getAllSumAssurance().mul(10000).div(gearingFactor);
  }

  function min(uint x, uint y) pure internal returns (uint) {
    return x < y ? x : y;
  }

  function max(uint x, uint y) pure internal returns (uint) {
    return x > y ? x : y;
  }

  /**
   * @dev Updates Uint Parameters
   * @param code parameter code
   * @param val new value
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
}
