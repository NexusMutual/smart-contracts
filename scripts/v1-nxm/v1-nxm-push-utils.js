const fs = require('node:fs/promises');
const util = require('node:util');

const deployments = require('@nexusmutual/deployments');
const { ethers } = require('hardhat');

const PROGRESS_FILE = 'v1-nxm-progress.json';

const waitFor = util.promisify(setTimeout);

function getContract(contractName, providerOrSigner = ethers.provider) {
  const abi = deployments[contractName];
  const address = deployments.addresses[contractName];
  if (!abi || !address) {
    throw new Error(`address or abi not found for ${contractName} contract`);
  }
  return new ethers.Contract(address, abi, providerOrSigner);
}

async function getGasFees(provider, priorityFee) {
  const { baseFeePerGas } = await provider.getBlock('pending');
  if (!baseFeePerGas) {
    throw new Error('Failed to get baseFeePerGas. Please try again');
  }
  const priorityFeeWei = ethers.utils.parseUnits(priorityFee.toString(), 'gwei');

  return {
    maxFeePerGas: baseFeePerGas.add(priorityFeeWei),
    maxPriorityFeePerGas: priorityFeeWei,
  };
}

/* Load / Save Progress */

async function loadProgress() {
  try {
    const data = await fs.readFile(PROGRESS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

async function saveProgress(data) {
  return fs.writeFile(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

/* v1 NXM push contract functions */

async function pushCoverNotes({ tc }, batch, gasFees) {
  const promises = batch.map(async item => {
    const { member, coverIds, lockReasonIndexes } = item;
    const tx = await tc.withdrawCoverNote(member, coverIds, lockReasonIndexes, gasFees);
    await tx.wait();
  });
  await Promise.all(promises);
}

async function pushClaimsAssessment({ tc }, batch, gasFees) {
  const members = batch.map(item => item.member);
  const tx = await tc.withdrawClaimAssessmentTokens(members, gasFees);
  await tx.wait();
}

async function pushV1StakingStake({ ps }, batch, gasFees) {
  const promises = batch.map(async item => {
    const tx = await ps.withdrawForUser(item.member, { ...gasFees, gasLimit: '100000' });
    await tx.wait();
  });
  await Promise.all(promises);
}

async function pushV1StakingRewards({ ps }, batch, gasFees) {
  const promises = batch.map(async item => {
    const tx = await ps.withdrawReward(item.member, gasFees);
    await tx.wait();
  });
  await Promise.all(promises);
}

module.exports = {
  waitFor,
  getContract,
  getGasFees,
  loadProgress,
  saveProgress,
  pushCoverNotes,
  pushClaimsAssessment,
  pushV1StakingStake,
  pushV1StakingRewards,
};
