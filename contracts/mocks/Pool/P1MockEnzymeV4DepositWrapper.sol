// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.5.17;

import "../../external/enzyme/IEnzymeV4DepositWrapper.sol";

contract P1MockEnzymeV4DepositWrapper is IEnzymeV4DepositWrapper {
  function exchangeEthAndBuyShares(
    address  comptrollerProxy,
    address denominationAsset,
    uint256 minSharesQuantity,
    address exchange,
    address exchangeApproveTarget,
    bytes calldata exchangeData,
    uint256 minInvestmentAmount) external payable returns (uint112, uint112, uint32) {
    return (0, 0, 0);
  }
}
