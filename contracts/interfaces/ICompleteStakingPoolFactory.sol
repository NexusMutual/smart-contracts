// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./IStakingPoolFactory.sol";

/*
* IStakingPoolFactory is missing the changeOperator function
* any change to the original interface will affect staking pool addresses
* This interface is created to add the changeOperator function so it can be used in other contracts
*/
interface ICompleteStakingPoolFactory is IStakingPoolFactory {

  function changeOperator(address newOperator) external;
}
