// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./IStakingPoolFactory.sol";

/**
 * @dev IStakingPoolFactory is missing the changeOperator() and operator() functions.
 * @dev Any change to the original interface will affect staking pool addresses
 * @dev This interface is created to add the missing functions so it can be used in other contracts.
 */
interface ICompleteStakingPoolFactory is IStakingPoolFactory {

  function operator() external view returns (address);

  function changeOperator(address newOperator) external;
}
