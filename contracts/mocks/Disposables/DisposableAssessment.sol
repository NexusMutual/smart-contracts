// SPDX-License-Identifier: GPL-3.0-only

pragma solidity ^0.8.9;

import "../../interfaces/IAssessment.sol";
import "../../abstract/MasterAwareV2.sol";

contract DisposableAssessment is MasterAwareV2 {

  /* ========== STATE VARIABLES ========== */

  IAssessment.Configuration public config;

  mapping(address => IAssessment.Stake) public stakeOf;

  mapping(address => IAssessment.Vote[]) public votesOf;

  mapping(address => mapping(uint => bool)) public hasAlreadyVotedOn;

  bytes32[] internal fraudResolution;

  IAssessment.Assessment[] public assessments;

  /* ========== CONSTRUCTOR ========== */

  function initialize (address masterAddress) external {
    config.minVotingPeriodInDays = 3; // days
    config.payoutCooldownInDays = 1; //days
    master = INXMMaster(masterAddress);
  }

  function changeDependentContractAddress() external override {}

}
