const { ethers } = require('hardhat');
const { MerkleTree } = require('merkletreejs');
const { setNextBlockTime, mineNextBlock } = require('../../utils/evm');
const { parseEther, arrayify, hexZeroPad, hexValue, keccak256 } = ethers.utils;
const { BigNumber } = ethers;

const STATUS = {
  PENDING: 0,
  ACCEPTED: 1,
  DENIED: 2,
};

const daysToSeconds = days => days * 24 * 60 * 60;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

const getVoteCountOfAddresses = assessment => async addresses =>
  await Promise.all(addresses.map(address => assessment.getVoteCountOfAssessor(address)));

const getFraudCountOfAddresses = assessment => async addresses => {
  const stakes = await Promise.all(addresses.map(address => assessment.stakeOf(address)));
  return stakes.map(x => x.fraudCount);
};

const getLeafInput = (address, lastFraudulentVoteIndex, burnAmount, fraudCount) => {
  return [
    ...arrayify(address),
    ...arrayify(hexZeroPad(hexValue(lastFraudulentVoteIndex), 32)),
    ...arrayify(hexZeroPad(hexValue(burnAmount), 12)),
    ...arrayify(hexZeroPad(hexValue(fraudCount), 2)),
  ];
};

const getProof = ({ address, lastFraudulentVoteIndex, amount, fraudCount, merkleTree }) => {
  const input = getLeafInput(address, lastFraudulentVoteIndex, amount, fraudCount);
  const proof = merkleTree.getHexProof(keccak256(input));
  return proof;
};

const submitFraud = async ({ assessment, signer, addresses, amounts, lastFraudulentVoteIndexes }) => {
  const voteCounts = await getVoteCountOfAddresses(assessment)(addresses);
  const fraudCounts = await getFraudCountOfAddresses(assessment)(addresses);
  const leaves = addresses.map((address, i) => {
    // Assume the last fraudulent vote was also the last vote
    const lastFraudulentVoteIndex = (lastFraudulentVoteIndexes && lastFraudulentVoteIndexes[i]) || voteCounts[i] - 1;
    const input = getLeafInput(address, lastFraudulentVoteIndex, amounts[i], fraudCounts[i]);
    return input;
  });
  const merkleTree = new MerkleTree(leaves, keccak256, { hashLeaves: true, sortPairs: true });
  const root = merkleTree.getHexRoot();
  await assessment.connect(signer).submitFraud(root);
  return merkleTree;
};

const burnFraud = assessment => async (rootIndex, addresses, amounts, callsPerAddress, merkleTree) => {
  let gasUsed = ethers.constants.Zero;
  const voteCounts = await getVoteCountOfAddresses(assessment)(addresses);
  const fraudCounts = await getFraudCountOfAddresses(assessment)(addresses);
  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    for (let j = 0; j < callsPerAddress; j++) {
      const lastFraudulentVoteIndex = voteCounts[i] - 1;
      const proof = getProof({
        address,
        lastFraudulentVoteIndex,
        amount: amounts[i],
        fraudCount: fraudCounts[i],
        merkleTree,
      });
      const tx = await assessment.burnFraud(
        rootIndex,
        proof,
        address,
        lastFraudulentVoteIndex,
        amounts[i],
        fraudCounts[i],
        callsPerAddress,
      );
      const receipt = await tx.wait();
      gasUsed = gasUsed.add(receipt.gasUsed);
    }
  }
  return gasUsed;
};

const getDurationByTokenWeight =
  ({ config }) =>
  (tokens, payoutImpact) => {
    const { minVotingPeriodInDays, maxVotingPeriodDays } = config;
    const MULTIPLIER = '10'; // 10x the cover amount
    let tokenDrivenStrength = tokens.mul(parseEther('1')).div(payoutImpact.mul(MULTIPLIER));
    // tokenDrivenStrength is capped at 1 i.e. 100%
    tokenDrivenStrength = tokenDrivenStrength.gt(parseEther('1')) ? parseEther('1') : tokenDrivenStrength;
    return BigNumber.from(daysToSeconds(minVotingPeriodInDays).toString())
      .add(
        BigNumber.from(daysToSeconds(maxVotingPeriodDays - minVotingPeriodInDays).toString())
          .mul(parseEther('1').sub(tokenDrivenStrength))
          .div(parseEther('1')),
      )
      .toNumber();
  };

const getDurationByConsensus =
  ({ config }) =>
  ({ accepted, denied }) => {
    const { minVotingPeriodInDays, maxVotingPeriodDays } = config;
    if (accepted.isZero()) {
      return daysToSeconds(maxVotingPeriodDays);
    }
    const consensusStrength = accepted.mul(parseEther('2')).div(accepted.add(denied)).sub(parseEther('1')).abs();
    return parseEther(daysToSeconds(minVotingPeriodInDays).toString())
      .add(
        parseEther(daysToSeconds(maxVotingPeriodDays - minVotingPeriodInDays).toString())
          .mul(parseEther('1').sub(consensusStrength))
          .div(parseEther('1')),
      )
      .div(parseEther('1'))
      .toNumber();
  };

const finalizePoll = async assessment => {
  const { timestamp } = await ethers.provider.getBlock('latest');
  const { minVotingPeriodInDays, payoutCooldownInDays } = await assessment.config();

  await setTime(timestamp + daysToSeconds(minVotingPeriodInDays + payoutCooldownInDays) + 1);
};

const generateRewards = async ({ assessment, individualClaims, staker }) => {
  await assessment.connect(staker).stake(parseEther('10'));

  await individualClaims.connect(staker).submitClaim(0, 0, parseEther('100'), '');
  await assessment.connect(staker).castVotes([0], [true], ['Assessment data hash'], 0);
};

module.exports = {
  STATUS,
  daysToSeconds,
  setTime,
  submitFraud,
  burnFraud,
  getProof,
  getDurationByTokenWeight,
  getDurationByConsensus,
  finalizePoll,
  generateRewards,
};
