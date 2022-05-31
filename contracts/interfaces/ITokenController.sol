// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "./INXMToken.sol";

interface ITokenController {

  struct CoverInfo {
    uint16 claimCount;
    bool hasOpenClaim;
    bool hasAcceptedClaim;
    // note: still 224 bits available here, can be used later
  }

  struct WithdrawFromStakingNftParams {
    uint id;
    uint[] trancheIds;
  }

  struct WithdrawFromStakingPoolParams {
    address poolAddress;
    WithdrawFromStakingNftParams[] nfts;
  }

  function coverInfo(uint id) external view returns (uint16 claimCount, bool hasOpenClaim, bool hasAcceptedClaim);

  function withdrawCoverNote(
    address _of,
    uint[] calldata _coverIds,
    uint[] calldata _indexes
  ) external;

  function changeOperator(address _newOperator) external;

  function operatorTransfer(address _from, address _to, uint _value) external returns (bool);

  function burnFrom(address _of, uint amount) external returns (bool);

  function addToWhitelist(address _member) external;

  function removeFromWhitelist(address _member) external;

  function mint(address _member, uint _amount) external;

  function lockForMemberVote(address _of, uint _days) external;

  function withdrawClaimAssessmentTokens(address[] calldata users) external;

  function getLockReasons(address _of) external view returns (bytes32[] memory reasons);

  function totalSupply() external view returns (uint256);

  function totalBalanceOf(address _of) external view returns (uint256 amount);

  function token() external view returns (INXMToken);

  function mintPooledStakingNXMRewards(uint amount, uint poolId) external;

  function burnPooledStakingNXMRewards(uint amount, uint poolId) external;

  function depositStakedNXM(address from, uint amount, uint poolId) external;

  function withdrawStakedNXM(address to, uint amount, uint poolId) external;
}
