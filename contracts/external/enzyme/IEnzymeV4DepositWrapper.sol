// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

interface IEnzymeV4DepositWrapper {
  function exchangeEthAndBuyShares(
    address  comptrollerProxy, 
    address denominationAsset, 
    uint256 minSharesQuantity, 
    address exchange, 
    address exchangeApproveTarget, 
    bytes calldata exchangeData, 
    uint256 minInvestmentAmount) external payable returns (uint112, uint112, uint32);
}
