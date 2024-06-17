// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./IStakingPoolFactory.sol";

interface ICompleteStakingPoolFactory is IStakingPoolFactory {

  function changeOperator(address newOperator) external;
}
