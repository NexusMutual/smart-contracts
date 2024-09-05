const fs = require('node:fs/promises');
const util = require('node:util');

const deployments = require('@nexusmutual/deployments');
const { ethers } = require('ethers');

const PROGRESS_FILE = 'v1-nxm-progress.json';

const waitFor = util.promisify(setTimeout);

function getContract(contractName, providerOrSigner) {
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
  const maxFeePerGas = baseFeePerGas.add(priorityFeeWei);

  return maxFeePerGas;
}

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
async function pushClaimsAssessment({ tc }, batch) {
  const members = batch.map(item => item.member);
  await tc.withdrawClaimAssessmentTokens(members);
}

async function pushCoverNotes({ tc }, batch) {
  const promises = batch.map(item => {
    const { member, coverIds, lockReasonIndexes } = item;
    return tc.withdrawCoverNote(member, coverIds, lockReasonIndexes);
  });
  await Promise.all(promises);
}

async function pushV1StakingStake({ ps }, batch) {
  const promises = batch.map(item => ps.withdrawForUser(item.member));
  await Promise.all(promises);
}

async function pushV1StakingRewards({ ps }, batch) {
  const promises = batch.map(item => ps.withdrawReward(item.member));
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
