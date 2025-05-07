// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/ILegacyMCR.sol";
import "../../interfaces/IPool.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";

contract LegacyMCR is ILegacyMCR, MasterAwareV2 {
  using SafeUintCast for uint;

  uint80 public mcr;
  uint80 public desiredMCR;
  uint32 public lastUpdateTime;

  ILegacyMCR public previousMCR;

  event MCRUpdated(
    uint mcr,
    uint desiredMCR,
    uint mcrFloor,  // unused
    uint mcrETHWithGear,
    uint totalSumAssured
  );

  // MCR related constants expressed in basis points
  uint internal constant MAX_MCR_ADJUSTMENT = 100;
  uint internal constant MAX_MCR_INCREMENT = 500;
  uint internal constant BASIS_PRECISION = 10000;
  uint internal constant GEARING_FACTOR = 48000;

  // min update between MCR updates in seconds
  uint internal constant MIN_UPDATE_TIME = 3600;

  // Implement the missing functions from ILegacyMCR interface
  function maxMCRIncrement() external pure override returns (uint16) {
    return uint16(MAX_MCR_INCREMENT);
  }

  function gearingFactor() external pure override returns (uint24) {
    return uint24(GEARING_FACTOR);
  }

  function minUpdateTime() external pure override returns (uint16) {
    return uint16(MIN_UPDATE_TIME);
  }

  /* ========== DEPENDENCIES ========== */

  function pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
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

    previousMCR = ILegacyMCR(address(0));
  }

  /**
   * @dev Gets total covered amount in ETH terms
   * @return amount in ETH
   */
  function getTotalActiveCoverAmount() public view returns (uint) {

    IPool _pool = pool();
    ICover _cover = cover();

    uint totalActiveCoverAmountInEth = _cover.totalActiveCoverInAsset(0);

    Asset[] memory assets = _pool.getAssets();

    // the first asset is ETH. skip it, it's already counted
    for (uint i = 1; i < assets.length; i++) {
      uint activeCoverAmount = _cover.totalActiveCoverInAsset(i);
      uint assetAmountInEth = _pool.getEthForAsset(assets[i].assetAddress, activeCoverAmount);
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

    uint _gearingFactor = GEARING_FACTOR;
    uint _minUpdateTime = MIN_UPDATE_TIME;

    // read with 1 SLOAD
    uint112 _mcr = mcr;
    uint112 _desiredMCR = desiredMCR;
    uint32 _lastUpdateTime = lastUpdateTime;

    if (!forceUpdate && _lastUpdateTime + _minUpdateTime > block.timestamp) {
      return;
    }

    // sync the current virtual MCR value to storage
    uint80 newMCR = getMCR().toUint80();
    if (newMCR != _mcr) {
      mcr = newMCR;
    }

    uint totalSumAssured = getTotalActiveCoverAmount();
    uint gearedMCR = totalSumAssured * BASIS_PRECISION / _gearingFactor;

    uint80 newDesiredMCR = gearedMCR.toUint80();
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
    uint _maxMCRIncrement = MAX_MCR_INCREMENT;

    if (block.timestamp == _lastUpdateTime) {
      return _mcr;
    }

    uint basisPointsAdjustment = _maxMCRIncrement * (block.timestamp - _lastUpdateTime) / 1 days;
    basisPointsAdjustment = Math.min(basisPointsAdjustment, MAX_MCR_ADJUSTMENT);

    if (_desiredMCR > _mcr) {
      return Math.min(_mcr * (basisPointsAdjustment + BASIS_PRECISION) / BASIS_PRECISION, _desiredMCR);
    }

    // in case desiredMCR <= mcr
    return Math.max(_mcr * (BASIS_PRECISION - basisPointsAdjustment) / (BASIS_PRECISION), _desiredMCR);
  }

  function getGearedMCR() external view returns (uint) {
    return getTotalActiveCoverAmount() * BASIS_PRECISION / GEARING_FACTOR;
  }

}
