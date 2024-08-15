const { ethers } = require('hardhat');
const { abis, addresses } = require('@nexusmutual/deployments');

const storage = {
  NXM: '', // immutable
  config: {}, // { minVotingPeriodInDays; stakeLockupPeriodInDays; payoutCooldownInDays; silentEndingPeriodInDays; }
  stakeOf: {}, // address => { amount; rewardsWithdrawableFromIndex; fraudCount; }
  votesOf: {}, // address => { assessmentId; accepted; timestamp; stakedAmount; }
  hasAlreadyVotedOn: {}, // address => uint assessmentId => bool
  assessments: [], // { Poll poll; totalRewardInNXM; assessmentDepositInETH; }
};

const getStorage = async assessment => {
  assessment = assessment || (await ethers.getContractAt(abis.Assessment, addresses.Assessment));

      this.assessment.nxm(),
      this.assessment.config(),

  await Promise.all([]);
};

const get

const getAssesssmentMemberStorage = (assessment, member) => {
  //
};

module.exports = { getStorage, getAssesssmentMemberStorage };
