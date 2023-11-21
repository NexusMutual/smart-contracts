// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/ICover.sol";
import "../../interfaces/IMCR.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IPriceFeedOracle.sol";
import "../../libraries/Math.sol";
import "../../libraries/SafeUintCast.sol";

contract MCR is IMCR, MasterAwareV2 {
  using SafeUintCast for uint;

  // the following values are expressed in basis points
  uint16 public maxMCRIncrement = 500;
  uint24 public gearingFactor = 48000;
  // min update between MCR updates in seconds
  uint16 public minUpdateTime = 3600;

  uint80 public mcr;
  uint80 public desiredMCR;
  uint32 public lastUpdateTime;

  IMCR public previousMCR;

  event MCRUpdated(
    uint mcr,
    uint desiredMCR,
    uint mcrFloor,  // unused
    uint mcrETHWithGear,
    uint totalSumAssured
  );

  uint public constant MAX_MCR_ADJUSTMENT = 100;
  uint public constant BASIS_PRECISION = 10000;

  uint public immutable MCR_UPDATE_DEADLINE;

  constructor (address masterAddress, uint mcrUpdateDeadline) {
    changeMasterAddress(masterAddress);
    MCR_UPDATE_DEADLINE = mcrUpdateDeadline;

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
   * @dev We need to move the mcr way below the current value otherwise swaps
   *      won't work for a while until mcr moves down by itself
   * @dev Remove this code after the tokenomics upgrade.
   */
  function teleportMCR() external {

    require(address(previousMCR) == address(0), "MCR: not yet initialized");
    require(mcr > 10_000 ether, "MCR: already updated");
    require(block.timestamp < MCR_UPDATE_DEADLINE, "MCR: Deadline has passed");

    mcr = 10_000 ether;
    desiredMCR = 10_000 ether;
    lastUpdateTime = block.timestamp.toUint32();
  }

  /**
   * @dev Gets total sum assured (in ETH).
   * @return amount of sum assured
   */
  function getTotalActiveCoverAmount() public view returns (uint) {

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
    uint _maxMCRIncrement = maxMCRIncrement;

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
    return getTotalActiveCoverAmount() * BASIS_PRECISION / gearingFactor;
  }

  /**
   * @dev Updates Uint Parameters
   * @param code parameter code
   * @param value new value
   */
  function updateUintParameters(bytes8 code, uint value) public onlyGovernance {

    if (code == "MMIC") {

      maxMCRIncrement = value.toUint16();

    } else if (code == "GEAR") {

      gearingFactor = value.toUint24();

    } else if (code == "MUTI") {

      minUpdateTime = value.toUint16();

    } else {
      revert("Invalid param code");
    }
  }
}
