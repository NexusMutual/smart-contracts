// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "@openzeppelin/contracts-v4/token/ERC20/IERC20.sol";
import "../../abstract/MasterAwareV2.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IPriceFeedOracle.sol";
import "../../interfaces/ISafeTracker.sol";

contract SafeTracker is ISafeTracker, MasterAwareV2 {

  uint public investedUSDC;

  string public symbol = "NXMIS";
  string public name = "NXMIS";
  uint8 public decimals = 18;

  address public immutable safe;
  IERC20 public immutable aweth;
  IERC20 public immutable usdc;
  IERC20 public immutable debtUsdc;

  /* ========== CONSTRUCTOR ========== */

  constructor(address _safe, address _usdc, address _aweth, address _debtUsdc) {
    safe = _safe;
    usdc = IERC20(_usdc);
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
    if (account != address(pool())) {
      return 0;
    }
    return _calculateBalance();
  }

  /**
  * @dev Updates invested USDC
  */
  function updateInvestedUSDC(uint _investedUSDC) external {
    require(msg.sender == safe, "SafeTracker: not safe");
    investedUSDC = _investedUSDC;
  }

  /**
  * @dev emits Transfer event only if it's called by Pool or SwapOperator
  */
  function transfer(address, uint256 amount) external returns (bool){
    if (amount == 0 || msg.sender == internalContracts[uint(ID.P1)] || msg.sender == pool().swapOperator()) {
      emit Transfer(address(0), address(0), 0); // add arguments
      return true;
    }
    revert();
  }

  /**
  * @dev emits Transfer event only if it's called by Pool or SwapOperator
  */
  function transferFrom(address, address, uint256 amount) external returns(bool) {
    if (amount == 0 || msg.sender == internalContracts[uint(ID.P1)] || msg.sender == pool().swapOperator()) {
      emit Transfer(address(0), address(0), 0); // add arguments
      return true;
    }
    revert();
  }

  function allowance(address, address) external pure returns (uint256){
    return 0;
  }

  function approve(address, uint256) external pure override returns (bool){
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

    // usdc actually in the safe
    uint usdcAmount = usdc.balanceOf(safe) + investedUSDC;
    uint usdcInEth = priceFeedOracle.getEthForAsset(address(usdc), usdcAmount);

    // usdc debt (borrowed usdc)
    uint usdcDebtAmount = debtUsdc.balanceOf(safe);
    uint usdcDebtInEth = priceFeedOracle.getEthForAsset(address(usdc), usdcDebtAmount);

    return ethAmount + usdcInEth - usdcDebtInEth;
  }

  /* ========== DEPENDENCIES ========== */

  function pool() internal view returns (IPool) {
    return IPool(internalContracts[uint(ID.P1)]);
  }

  function changeDependentContractAddress() external override {
    internalContracts[uint(ID.P1)] = master.getLatestAddress("P1");
  }
}
