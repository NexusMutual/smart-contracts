// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.28;

import "@openzeppelin/contracts-v4/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";

import "../../abstract/ReentrancyGuard.sol";
import "../../abstract/RegistryAware.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/ISafeTracker.sol";
import "../../libraries/SafeUintCast.sol";

contract SafeTracker is ISafeTracker, RegistryAware, ReentrancyGuard {
  using SafeUintCast for uint;

  // master + mapping
  uint[2] internal _unused;
  uint public offchainInvestmentUSDC;

  // dynamically tracked assets held by the safe
  SafeAsset[] public assets;
  mapping(address assetAddress => SafeOracle) public oracles;

  string public constant symbol = "NXMIS";
  string public constant name = "NXMIS";
  uint8 public constant decimals = 18;

  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  uint public constant AGGREGATOR_DECIMALS = 18;

  address public immutable safe;
  uint public immutable investmentLimit;

  IERC20 public immutable usdc;
  IERC20 public immutable aweth;
  IERC20 public immutable debtUsdc;
  IPool public immutable pool;

  /* ========== MODIFIERS ========== */

  modifier onlySafe() {
    require(msg.sender == safe, OnlySafe());
    _;
  }

  /* ========== CONSTRUCTOR ========== */

  constructor(
    address _registry,
    uint _investmentLimit,
    address _safe,
    address _usdc,
    address _aweth,
    address _debtUsdc
  ) RegistryAware(_registry) {

    require(
      _usdc != address(0) && _aweth != address(0) && _debtUsdc != address(0),
      "SafeTracker: tokens address cannot be zero address"
    );

    investmentLimit = _investmentLimit;
    safe = _safe;
    usdc = IERC20(_usdc);
    aweth = IERC20(_aweth);
    debtUsdc = IERC20(_debtUsdc);
    pool = IPool(fetch(C_POOL));
  }

  /**
  * @dev Gets the balance of the safe
  * @return An uint256 representing the amount of the safe.
  */
  function totalSupply() external view returns (uint256) {
    return _calculateBalance();
  }

  /**
  * @dev Gets the balance of the safe
  * @return An uint256 representing the amount of the safe.
  */
  function balanceOf(address account) external view returns (uint256) {
    return account == address(pool) ? _calculateBalance() : 0;
  }

  /**
  * @dev Updates the amount of USDC invested offchain (e.g. CoverRe)
  */
  function updateOffchainInvestmentUSDC(uint investedUSDC) external onlySafe {
    require(investedUSDC <= investmentLimit, InvestmentSurpassesLimit());

    offchainInvestmentUSDC = investedUSDC;
    emit OffchainInvestmentUSDCUpdated(investedUSDC);
  }

  function transferAssetToSafe(
    address assetAddress,
    uint amount
  ) external onlyContracts(C_GOVERNOR) whenNotPaused(PAUSE_GLOBAL) nonReentrant {
    pool.transferAssetToSafe(assetAddress, safe, amount);
  }

  /* ========== ASSETS ========== */

  function getAsset(uint assetId) external view returns (SafeAsset memory) {
    require(assetId < assets.length, InvalidAssetId());
    return assets[assetId];
  }

  function getAssets() external view returns (SafeAsset[] memory) {
    return assets;
  }

  function getAssetId(address assetAddress) public view returns (uint) {

    uint assetCount = assets.length;
    for (uint i = 0; i < assetCount; i++) {
      if (assets[i].assetAddress == assetAddress) {
        return i;
      }
    }

    revert AssetNotFound();
  }

  /**
  * @dev Adds a new asset held by the safe. Only ETH denominated aggregators (18 decimals) are supported.
  * @param assetAddress address of the ERC20 token held by the safe
  * @param aggregator oracle returning the asset price in ETH
  */
  function addAsset(address assetAddress, SafeAggregator aggregator) external onlySafe {

    require(assetAddress != address(0), AssetMustNotBeZeroAddress());
    require(assetAddress != ETH, AssetMustNotBeETH());

    // these are already accounted for in the aave position
    require(assetAddress != address(aweth) && assetAddress != address(debtUsdc), AssetAlreadyTracked());

    uint assetCount = assets.length;
    for (uint i = 0; i < assetCount; i++) {
      require(assetAddress != assets[i].assetAddress, AssetAlreadyExists());
    }

    _validateAggregator(aggregator);

    uint assetDecimals = IERC20Metadata(assetAddress).decimals();

    assets.push(SafeAsset({
      assetAddress: assetAddress,
      isAbandoned: false
    }));

    oracles[assetAddress] = SafeOracle({
      aggregator: aggregator,
      assetDecimals: assetDecimals.toUint8()
    });

    emit AssetAdded(assetAddress, address(aggregator));
  }

  /**
  * @dev Updates the oracle of an existing asset
  */
  function setAssetOracle(address assetAddress, SafeAggregator aggregator) external onlySafe {

    // reverts with AssetNotFound if the asset is not registered
    getAssetId(assetAddress);

    _validateAggregator(aggregator);

    uint assetDecimals = IERC20Metadata(assetAddress).decimals();

    oracles[assetAddress] = SafeOracle({
      aggregator: aggregator,
      assetDecimals: assetDecimals.toUint8()
    });

    emit AssetOracleUpdated(assetAddress, address(aggregator));
  }

  /**
  * @dev Marks an asset as abandoned (excluded from the balance) or restores it
  */
  function setAssetDetails(uint assetId, bool isAbandoned) external onlySafe {
    require(assetId < assets.length, InvalidAssetId());
    assets[assetId].isAbandoned = isAbandoned;
    emit AssetDetailsUpdated(assetId, isAbandoned);
  }

  /* ========== ORACLES ========== */

  /**
  * @dev Converts an amount of a tracked asset to its ETH value using the asset's oracle
  */
  function getEthForAsset(address assetAddress, uint amount) public view returns (uint) {

    SafeOracle memory oracle = oracles[assetAddress];
    require(address(oracle.aggregator) != address(0), AssetNotFound());

    int rate = oracle.aggregator.latestAnswer();

    if (rate <= 0) {
      revert NonPositiveRate(address(oracle.aggregator), rate);
    }

    return amount * uint(rate) / 10 ** oracle.assetDecimals;
  }

  function _validateAggregator(SafeAggregator aggregator) internal view {
    require(address(aggregator) != address(0), AggregatorMustNotBeZeroAddress());

    uint aggregatorDecimals = aggregator.decimals();

    if (aggregatorDecimals != AGGREGATOR_DECIMALS) {
      revert IncompatibleAggregatorDecimals(address(aggregator), AGGREGATOR_DECIMALS, aggregatorDecimals);
    }
  }

  /* ========== ERC20 ========== */

  /**
  * @dev emits Transfer event only if it's called by Pool or SwapOperator
  */
  function transfer(address to, uint256 amount) external returns (bool) {
    return _transfer(msg.sender, to, amount);
  }

  /**
  * @dev emits Transfer event only if it's called by Pool or SwapOperator
  */
  function transferFrom(address from, address to, uint256 amount) external returns (bool) {
    return _transfer(from, to, amount);
  }

  function allowance(address, address) external pure returns (uint256) {
    return 0;
  }

  function approve(address spender, uint256 value) external override returns (bool) {
    emit Approval(msg.sender, spender, value);
    return true;
  }

  /**
   * @dev Returns the latest answer for the price of NXMIS in ETH
   * @dev Same signature as Aggregator.latestAnswer so we can use it as its own oracle
   * @return 1e18 (1 NXMIS = 1 ETH)
   */
  function latestAnswer() external pure returns (uint256) {
    return 1 ether;
  }

  /* ========== BALANCE ========== */

  /**
  * @dev Fetches all necessary information about the tokens that are used in the safe and calculates the balance
  * @return balance ETH value of the safe.
  */
  function _calculateBalance() internal view returns (uint256 balance) {

    // eth in the safe
    uint ethAmount = address(safe).balance;

    // usdc invested offchain, skip the oracle call if there is no investment
    uint offchainInvestmentInEth = offchainInvestmentUSDC > 0
      ? pool.getEthForAsset(address(usdc), offchainInvestmentUSDC)
      : 0;

    // aave position: aweth collateral and borrowed usdc
    (uint aaveCollateralInEth, uint aaveDebtInEth) = _calculateAavePosition();

    // dynamically tracked assets (weth, usdc, ...)
    uint trackedAssetsValueInEth = _calculateTrackedAssetsValue();

    return ethAmount + offchainInvestmentInEth + aaveCollateralInEth + trackedAssetsValueInEth - aaveDebtInEth;
  }

  /**
  * @dev Calculates the aave position of the safe
  * @return collateralInEth aweth balance, 1:1 to eth
  * @return debtInEth ETH value of the borrowed usdc, 0 if there is no debt
  */
  function _calculateAavePosition() internal view returns (uint collateralInEth, uint debtInEth) {

    collateralInEth = aweth.balanceOf(safe);

    uint debtUsdcAmount = debtUsdc.balanceOf(safe);

    if (debtUsdcAmount > 0) {
      debtInEth = pool.getEthForAsset(address(usdc), debtUsdcAmount);
    }
  }

  /**
  * @dev Sums the ETH value of all non-abandoned tracked assets held by the safe
  */
  function _calculateTrackedAssetsValue() internal view returns (uint total) {

    uint assetCount = assets.length;

    for (uint i = 0; i < assetCount; i++) {

      SafeAsset memory asset = assets[i];

      if (asset.isAbandoned) {
        continue;
      }

      address assetAddress = asset.assetAddress;
      uint assetBalance;

      if (assetAddress.code.length != 0) {
        try IERC20(assetAddress).balanceOf(safe) returns (uint balance) {
          assetBalance = balance;
        } catch {
          // If balanceOf reverts consider it 0
        }
      }

      if (assetBalance == 0) {
        continue;
      }

      total += getEthForAsset(assetAddress, assetBalance);
    }
  }

  function _transfer(address from, address to, uint256 amount) internal returns (bool) {

    require(amount == 0 || msg.sender == address(pool), AmountExceedsBalance());

    emit Transfer(from, to, amount);
    return true;
  }

}
