const fs = require('node:fs/promises');
const util = require('node:util');

const deployments = require('@nexusmutual/deployments');
const { ethers } = require('ethers');

const PROGRESS_FILE = 'v1-nxm-progress.json';

const waitFor = util.promisify(setTimeout);

function getContract(contractName, signer) {
  const abi = deployments[contractName];
  const address = deployments.addresses[contractName];
  if (!abi || !address) {
    throw new Error(`address or abi not found for ${contractName} contract`);
  }
  return new ethers.Contract(address, abi, signer);
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
async function pushCoverNotes({ tc }, item) {
  const { member, coverIds, lockReasonIndexes } = item;
  await tc.withdrawCoverNote(member, coverIds, lockReasonIndexes);
}

async function pushClaimsAssessment({ tc }, items) {
  const members = items.map(item => item.member);
  await tc.withdrawClaimAssessmentTokens(members);
}

async function pushV1StakingStake({ ps }, item) {
  await ps.withdrawForUser(item.member);
}

async function pushV1StakingRewards({ ps }, item) {
  await ps.withdrawReward(item.member);
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
