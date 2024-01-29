// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IPriceFeedOracle.sol";
import "../../interfaces/ISafeTracker.sol";

contract SafeTracker is ISafeTracker, MasterAwareV2 {

  uint public coverReInvestmentUSDC;

  string public symbol = "NXMIS";
  string public name = "NXMIS";
  uint8 public decimals = 18;

  address public immutable safe;
  uint public immutable investmentLimit;

  IERC20 public immutable usdc;
  IERC20 public immutable dai;
  IERC20 public immutable aweth;
  IERC20 public immutable debtUsdc;

  /* ========== CONSTRUCTOR ========== */

  constructor(
    address _master,
    uint _investmentLimit,
    address _safe,
    address _usdc,
    address _dai,
    address _aweth,
    address _debtUsdc
  ) {
    require(_master != address(0), "SafeTracker: master cannot be zero address");
    require(
      _usdc != address(0) && _dai != address(0) && _aweth != address(0) && _debtUsdc != address(0),
      "SafeTracker: tokens address cannot be zero address"
    );

    master = INXMMaster(_master);
    investmentLimit = _investmentLimit;
    safe = _safe;
    usdc = IERC20(_usdc);
    dai = IERC20(_dai);
    aweth = IERC20(_aweth);
    debtUsdc = IERC20(_debtUsdc);
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
    if (account != internalContracts[uint(ID.P1)]) {
      return 0;
    }
    return _calculateBalance();
  }

  /**
  * @dev Updates invested USDC in CoverRe
  */
  function updateCoverReInvestmentUSDC(uint investedUSDC) external {
    if (msg.sender != safe) {
      revert OnlySafe();
    }
    if (investedUSDC > investmentLimit) {
      revert InvestmentSurpassesLimit();
    }
    coverReInvestmentUSDC = investedUSDC;

    emit CoverReInvestmentUSDCUpdated(investedUSDC);
  }

  /**
  * @dev emits Transfer event only if it's called by Pool or SwapOperator
  */
  function transfer(address to, uint256 amount) external returns (bool) {
    return _transfer(msg.sender, to, amount);
  }

  /**
  * @dev emits Transfer event only if it's called by Pool or SwapOperator
  */
  function transferFrom(address from, address to, uint256 amount) external returns(bool) {
    return _transfer(from, to, amount);
  }

  function allowance(address, address) external pure returns (uint256) {
    return 0;
  }

  function approve(address, uint256) external pure override returns (bool) {
    revert();
  }

  /**
  * @dev Fetches all necessary information about the tokens that are used in the safe and calculates the balance
  * @return balance ETH value of the safe.
  */
  function _calculateBalance() internal view returns (uint256 balance) {

    // eth in the safe and aweth balance, aweth is 1:1 to eth
    uint ethAmount = address(safe).balance + aweth.balanceOf(safe);

    IPriceFeedOracle priceFeedOracle = pool().priceFeedOracle();

    // dai in the safe
    uint daiAmount = dai.balanceOf(safe);
    uint daiValueInEth = priceFeedOracle.getEthForAsset(address(dai), daiAmount);

    // usdc actually in the safe
    uint usdcAmount = usdc.balanceOf(safe) + coverReInvestmentUSDC;
    uint usdcValueInEth = priceFeedOracle.getEthForAsset(address(usdc), usdcAmount);

    // usdc debt (borrowed usdc)
    uint debtUsdcAmount = debtUsdc.balanceOf(safe);
    uint debtUsdcValueInEth = priceFeedOracle.getEthForAsset(address(usdc), debtUsdcAmount);

    return ethAmount + usdcValueInEth + daiValueInEth - debtUsdcValueInEth;
  }


  function _transfer(address from, address to, uint256 amount) internal returns (bool) {
    if (amount == 0 || msg.sender == internalContracts[uint(ID.P1)]) {
      emit Transfer(from, to, amount);
      return true;
    }
    revert();
  }

  /* ========== DEPENDENCIES ========== */

  function pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
  }
}
