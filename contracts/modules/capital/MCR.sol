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
import "./PoolData.sol";

contract MCR is Iupgradable {
  using SafeMath for uint;

  Pool public pool;
  QuotationData public qd;

  uint private constant minCapFactor = uint(10) ** 21;

  uint public mcr;
  uint public mcrFloor;
  uint public lastUpdateTime = 0;

  uint public dynamicMincapThresholdx100 = 13000;
  uint public dynamicMincapIncrementx100 = 100;
  uint public maxMCRIncrement = 500;
  uint public gearingFactor = 48000;

  event MCREvent(
    uint indexed date,
    uint blockNumber,
    bytes4[] allCurr,
    uint[] allCurrRates,
    uint mcrEtherx100,
    uint mcrPercx100,
    uint vFull
  );

  constructor (address masterAddress) public {

    changeMasterAddress(masterAddress);

    // we'll pass the zero address on the first deploy
    // due to missing previous MCR contract
    if (masterAddress == address(0)) {
      return;
    }

    address mcrAddress = ms.getLatestAddress("MC");
    MCR previousMCR = MCR(mcrAddress);

    // fetch MCR parameters from previous contract
    mcrFloor = previousMCR.mcrFloor();
    dynamicMincapThresholdx100 = previousMCR.dynamicMincapThresholdx100();
    dynamicMincapIncrementx100 = previousMCR.dynamicMincapIncrementx100();
  }

  // proxying this call through mcr contract to get rid of pd from pool
  function getLastMCREther() external view returns (uint) {
    return getMCR();
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

  function updateMCR(uint _mcr, uint _mcrFloor) external onlyInternal {
    mcr = _mcr;
    mcrFloor = _mcrFloor;
    lastUpdateTime = now;
  }

  function getMCR() public view returns (uint) {
    uint mcrFloor = getMCRFloor();
    uint totalSumAssured = getAllSumAssurance();

    uint mcrETHWithGear = totalSumAssured.mul(10000).div(gearingFactor);

    uint desiredMCREth = max(mcrETHWithGear, mcrFloor);
    uint percentageAdjustment = (now - lastUpdateTime) / 1 days * maxMCRIncrement;
    percentageAdjustment = min(percentageAdjustment, 1);

    uint mcr = min(mcr + mcr * percentageAdjustment / 100, desiredMCREth);
    return mcr;
  }

  function getMCRFloor() public view returns (uint) {
    uint percentageAdjustment = (now - lastUpdateTime) / 1 days * dynamicMincapIncrementx100;
    return mcrFloor.mul(percentageAdjustment.add(10000)).div(10000);
  }

  function min(uint x, uint y) pure internal returns (uint) {
    return x < y ? x : y;
  }

  function max(uint x, uint y) pure internal returns (uint) {
    return x > y ? x : y;
  }
}
