// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

interface IReUSDeNavOracle {
  function decimals() external view returns (uint8);
  function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

interface IEthUsdAggregator {
  function decimals() external view returns (uint8);
  function latestAnswer() external view returns (int256);
}

/// @dev Converts the reUSDe/USD NAV into an 18 decimals reUSDe/ETH rate using the ETH/USD aggregator
contract AggregatorReUSDe {

  uint8 public constant decimals = 18;

  IReUSDeNavOracle public immutable navOracle;
  IEthUsdAggregator public immutable ethUsdAggregator;
  uint public immutable ethUsdScale;

  error IncompatibleNavOracleDecimals(uint8 navOracleDecimals);
  error NonPositiveRate(address aggregator, int256 rate);

  constructor(address _navOracle, address _ethUsdAggregator) {
    navOracle = IReUSDeNavOracle(_navOracle);
    ethUsdAggregator = IEthUsdAggregator(_ethUsdAggregator);

    uint8 navOracleDecimals = navOracle.decimals();
    if (navOracleDecimals != decimals) {
      revert IncompatibleNavOracleDecimals(navOracleDecimals);
    }

    ethUsdScale = 10 ** ethUsdAggregator.decimals();
  }

  function latestAnswer() public view returns (int256) {
    (, int256 nav, , , ) = navOracle.latestRoundData();
    int256 ethUsd = ethUsdAggregator.latestAnswer();

    if (nav <= 0) {
      revert NonPositiveRate(address(navOracle), nav);
    }

    if (ethUsd <= 0) {
      revert NonPositiveRate(address(ethUsdAggregator), ethUsd);
    }

    return int256(uint256(nav) * ethUsdScale / uint256(ethUsd));
  }

}
