// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./IMinimalStakingPool.sol";

interface IMinimalCover {

  /* ========== VIEWS ========== */

  function stakingPool(uint index) external view returns (IMinimalStakingPool);

}
