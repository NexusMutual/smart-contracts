// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "../../interfaces/IMCR.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IPriceFeedOracle.sol";
import "../../interfaces/IQuotationData.sol";
import "../../interfaces/ICover.sol";
import "../../abstract/MasterAwareV2.sol";
import "../../libraries/Math.sol";
import "hardhat/console.sol";

contract MCR is IMCR, MasterAwareV2 {
  // sizeof(qd) + 96 = 160 + 96 = 256 (occupies entire slot)
  uint96 _unused;

  // the following values are expressed in basis points
  uint24 public _unused1; //mcrFloorIncrementThreshold
  uint24 public _unused2; // maxMCRFloorIncrement
  uint24 public maxMCRIncrement = 500;
  uint24 public gearingFactor = 48000;
  // min update between MCR updates in seconds
  uint24 public minUpdateTime = 3600;

  uint112 public _unused3;  // mcrFloor
  uint112 public mcr;
  uint112 public desiredMCR;
  uint32 public lastUpdateTime;

  IMCR public previousMCR;

  event MCRUpdated(
    uint mcr,
    uint desiredMCR,
    uint mcrFloor,  // unused
    uint mcrETHWithGear,
    uint totalSumAssured
  );

  uint constant UINT24_MAX = type(uint24).max;
  uint constant MAX_MCR_ADJUSTMENT = 100;
  uint constant BASIS_PRECISION = 10000;

  constructor (address masterAddress) {
    changeMasterAddress(masterAddress);

    if (masterAddress != address(0)) {
      previousMCR = IMCR(master.getLatestAddress("MC"));
    }
  }

  /* ========== DEPENDENCIES ========== */

  function pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  function memberRoles() internal view returns (IMemberRoles) {
    return IMemberRoles(internalContracts[uint(ID.MR)]);
  }

  function cover() internal view returns (ICover) {
    return ICover(internalContracts[uint(ID.CO)]);
  }

  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
    internalContracts[uint(ID.MR)] = master.getLatestAddress("MR");
    internalContracts[uint(ID.CO)] = master.getLatestAddress("CO");
    initialize();
  }

  function initialize() internal {

    address currentMCR = master.getLatestAddress("MC");

    if (address(previousMCR) == address(0) || currentMCR != address(this)) {
      // already initialized or not ready for initialization
      return;
    }

    // copy over values
    mcr = previousMCR.mcr();
    desiredMCR = previousMCR.desiredMCR();
    lastUpdateTime = previousMCR.lastUpdateTime();

    // copy over parameters
    maxMCRIncrement = previousMCR.maxMCRIncrement();
    gearingFactor = previousMCR.gearingFactor();
    minUpdateTime = previousMCR.minUpdateTime();

    previousMCR = IMCR(address(0));
  }

  /**
   * @dev Gets total sum assured (in ETH).
   * @return amount of sum assured
   */
  function getAllSumAssurance() public view returns (uint) {

    IPool _pool = pool();
    IPriceFeedOracle priceFeed = _pool.priceFeedOracle();
    ICover _cover = cover();

    uint totalActiveCoverAmountInEth = _cover.totalActiveCoverInAsset(0);

    Asset[] memory assets = _pool.getAssets();

    // the first asset is ETH. skip it, it's already counted
    for (uint i = 1; i < assets.length; i++) {
      uint activeCoverAmount = _cover.totalActiveCoverInAsset(i);
      uint assetAmountInEth = priceFeed.getEthForAsset(assets[i].assetAddress, activeCoverAmount);
      totalActiveCoverAmountInEth += assetAmountInEth;
    }

    return totalActiveCoverAmountInEth;
  }

  /*
  * @dev trigger an MCR update. Current virtual MCR value is synced to storage
  * and a new desiredMCR value to move towards is set.
  *
  */
  function updateMCR() whenNotPaused public {
    _updateMCR(false);
  }

  function updateMCRInternal(bool forceUpdate) public onlyInternal {
    _updateMCR(forceUpdate);
  }

  function _updateMCR(bool forceUpdate) internal {

    uint _gearingFactor = gearingFactor;
    uint _minUpdateTime = minUpdateTime;

    // read with 1 SLOAD
    uint112 _mcr = mcr;
    uint112 _desiredMCR = desiredMCR;
    uint32 _lastUpdateTime = lastUpdateTime;

    if (!forceUpdate && _lastUpdateTime + _minUpdateTime > block.timestamp) {
      return;
    }

    // sync the current virtual MCR value to storage
    uint112 newMCR = uint112(getMCR());
    if (newMCR != _mcr) {
      mcr = newMCR;
    }

    uint totalSumAssured = getAllSumAssurance();
    uint gearedMCR = totalSumAssured * BASIS_PRECISION / _gearingFactor;
    uint112 newDesiredMCR = uint112(gearedMCR);
    if (newDesiredMCR != _desiredMCR) {
      desiredMCR = newDesiredMCR;
    }

    lastUpdateTime = uint32(block.timestamp);

    emit MCRUpdated(mcr, desiredMCR, 0, gearedMCR, totalSumAssured);
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

    if (block.timestamp == _lastUpdateTime) {
      return _mcr;
    }

    uint _maxMCRIncrement = maxMCRIncrement;

    uint basisPointsAdjustment = _maxMCRIncrement * (block.timestamp - _lastUpdateTime) / 1 days;
    basisPointsAdjustment = Math.min(basisPointsAdjustment, MAX_MCR_ADJUSTMENT);

    if (_desiredMCR > _mcr) {
      return Math.min(_mcr * (basisPointsAdjustment + BASIS_PRECISION) / BASIS_PRECISION, _desiredMCR);
    }

    // in case desiredMCR <= mcr
    return Math.max(_mcr * (BASIS_PRECISION - basisPointsAdjustment) / (BASIS_PRECISION), _desiredMCR);
  }

  function getGearedMCR() external view returns (uint) {
    return getAllSumAssurance() * BASIS_PRECISION / gearingFactor;
  }

  /**
   * @dev Updates Uint Parameters
   * @param code parameter code
   * @param val new value
   */
  function updateUintParameters(bytes8 code, uint val) public onlyGovernance {

    if (code == "MMIC") {

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
