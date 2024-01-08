// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.18;

import "../../interfaces/IInvestmentTracker.sol";
import "../../interfaces/IPool.sol";
import "../../interfaces/IPriceFeedOracle.sol";
import "../../abstract/MasterAwareV2.sol";


contract InvestmentTracker is IInvestmentTracker, MasterAwareV2 {

  uint public investedUSDC;

  address public immutable safe;
  IERC20 public immutable aweth;
  IERC20 public immutable usdc;
  IERC20 public immutable debtUsdc;

  function balanceOf(address account) external view returns (uint256) {

    IPool _pool = pool();

    if (msg.sender != address(_pool)) {
      return 0;
    }

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

  function updateInvestedUSDC(uint _investedUSDC) external {
    require(msg.sender == safe, "InvestmentTracker: not safe");
    investedUSDC = _investedUSDC;
  }

  // implement the rest of the IERC20 interface

  // totalSupply - return the same as balanceOf(pool)
  // balanceOf - track the balance, collateral and debt of the safe
  // transfer - revert if the caller is not the pool, otherwise emit Transfer event
  // transferFrom - same as transfer
  // allowance - return 0
  // approve - revert, but first check if the pool or swap operator uses it
  // symbol - can hardcode it to some value
  // decimals - 18 like ETH

  function pool() external view returns (IPool) {
    //
  }

}
