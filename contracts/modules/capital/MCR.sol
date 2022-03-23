// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.0;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../abstract/MasterAware.sol";
import "../../interfaces/IMCR.sol";
import "../../interfaces/INXMToken.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IPriceFeedOracle.sol";
import "../../interfaces/IQuotationData.sol";
import "./LegacyMCR.sol";

contract MCR is IMCR, MasterAware {
  using SafeMath for uint;

  IPool public pool;
  IQuotationData public qd;
  // sizeof(qd) + 96 = 160 + 96 = 256 (occupies entire slot)
  uint96 _unused;

  // the following values are expressed in basis points
  uint24 public mcrFloorIncrementThreshold = 13000;
  uint24 public maxMCRFloorIncrement = 100;
  uint24 public maxMCRIncrement = 500;
  uint24 public gearingFactor = 48000;
  // min update between MCR updates in seconds
  uint24 public minUpdateTime = 3600;
  uint112 public mcrFloor;

  uint112 public mcr;
  uint112 public desiredMCR;
  uint32 public lastUpdateTime;

  IMCR public previousMCR;

  event MCRUpdated(
    uint mcr,
    uint desiredMCR,
    uint mcrFloor,
    uint mcrETHWithGear,
    uint totalSumAssured
  );

  uint constant UINT24_MAX = ~uint24(0);
  uint constant MAX_MCR_ADJUSTMENT = 100;
  uint constant BASIS_PRECISION = 10000;

  constructor (address masterAddress) public {
    changeMasterAddress(masterAddress);

    if (masterAddress != address(0)) {
      previousMCR = IMCR(master.getLatestAddress("MC"));
    }
  }

  /**
   * @dev Iupgradable Interface to update dependent contract address
   */
  function changeDependentContractAddress() public {
    qd = IQuotationData(master.getLatestAddress("QD"));
    pool = IPool(master.getLatestAddress("P1"));
    initialize();
  }

  function initialize() internal {

    address currentMCR = master.getLatestAddress("MC");

    if (address(previousMCR) == address(0) || currentMCR != address(this)) {
      // already initialized or not ready for initialization
      return;
    }

    mcrFloor = previousMCR.mcrFloor();

    mcr = previousMCR.mcr();
    desiredMCR = previousMCR.desiredMCR();
    lastUpdateTime = previousMCR.lastUpdateTime();
    maxMCRFloorIncrement = previousMCR.maxMCRFloorIncrement();

    previousMCR = IMCR(address(0));
  }

  /**
   * @dev Gets total sum assured (in ETH).
   * @return amount of sum assured
   */
  function getAllSumAssurance() public view returns (uint) {

    // Requires a new implementation once geared MCR should be used instead. To save gas it is
    // left out on purpose.
    return 0;

    // IPriceFeedOracle priceFeed = pool.priceFeedOracle();
    // address daiAddress = priceFeed.daiAddress();

    // uint ethAmount = qd.getTotalSumAssured("ETH").mul(1e18);
    // uint daiAmount = qd.getTotalSumAssured("DAI").mul(1e18);

    // uint daiRate = priceFeed.getAssetToEthRate(daiAddress);
    // uint daiAmountInEth = daiAmount.mul(daiRate).div(1e18);

    // return ethAmount.add(daiAmountInEth);
  }

  /*
  * @dev trigger an MCR update. Current virtual MCR value is synced to storage, mcrFloor is potentially updated
  * and a new desiredMCR value to move towards is set.
  *
  */
  function updateMCR() whenNotPaused public {
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

    if (!forceUpdate && _lastUpdateTime + _minUpdateTime > block.timestamp) {
      return;
    }

    if (block.timestamp > _lastUpdateTime && pool.calculateMCRRatio(poolValueInEth, _mcr) >= _mcrFloorIncrementThreshold) {
        // MCR floor updates by up to maxMCRFloorIncrement percentage per day whenever the MCR ratio exceeds 1.3
        // MCR floor is monotonically increasing.
      uint basisPointsAdjustment = min(
        _maxMCRFloorIncrement.mul(block.timestamp - _lastUpdateTime).div(1 days),
        _maxMCRFloorIncrement
      );
      uint newMCRFloor = _mcrFloor.mul(basisPointsAdjustment.add(BASIS_PRECISION)).div(BASIS_PRECISION);
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
    uint gearedMCR = totalSumAssured.mul(BASIS_PRECISION).div(_gearingFactor);
    uint112 newDesiredMCR = uint112(max(gearedMCR, mcrFloor));
    if (newDesiredMCR != _desiredMCR) {
      desiredMCR = newDesiredMCR;
    }

    lastUpdateTime = uint32(block.timestamp);

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


    if (block.timestamp == _lastUpdateTime) {
      return _mcr;
    }

    uint _maxMCRIncrement = maxMCRIncrement;

    uint basisPointsAdjustment = _maxMCRIncrement.mul(block.timestamp - _lastUpdateTime).div(1 days);
    basisPointsAdjustment = min(basisPointsAdjustment, MAX_MCR_ADJUSTMENT);

    if (_desiredMCR > _mcr) {
      return min(_mcr.mul(basisPointsAdjustment.add(BASIS_PRECISION)).div(BASIS_PRECISION), _desiredMCR);
    }

    // in case desiredMCR <= mcr
    return max(_mcr.mul(BASIS_PRECISION - basisPointsAdjustment).div(BASIS_PRECISION), _desiredMCR);
  }

  function getGearedMCR() external view returns (uint) {
    return getAllSumAssurance().mul(BASIS_PRECISION).div(gearingFactor);
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
    require(master.checkIsAuthToGoverned(msg.sender));
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
