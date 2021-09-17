const { ethers } = require('hardhat');
const keccak256 = require('keccak256');
const { MerkleTree } = require('merkletreejs');
const { parseEther, arrayify, hexZeroPad, hexValue } = ethers.utils;
const { BigNumber } = ethers;
const { Zero } = ethers.constants;

const EVENT_TYPE = {
  CLAIM: 0,
  INCIDENT: 1,
};

const STATUS = {
  PENDING: 0,
  ACCEPTED: 1,
  DENIED: 2,
};

const ASSET = {
  ETH: 0,
  DAI: 1,
};

// Converts days to seconds
const daysToSeconds = numberOfDays => numberOfDays * 24 * 60 * 60;

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

const submitFraud = assessment => async (signer, addresses, amounts) => {
  const voteCounts = await getVoteCountOfAddresses(assessment)(addresses);
  const fraudCounts = await getFraudCountOfAddresses(assessment)(addresses);
  const leaves = addresses.map((address, i) => {
    // Assume the last fraudulent vote was also the last vote
    const lastFraudulentVoteIndex = voteCounts[i] - 1;
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
      const input = getLeafInput(address, lastFraudulentVoteIndex, amounts[i], fraudCounts[i]);
      const proof = merkleTree.getHexProof(keccak256(input));
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

const submitClaim = ({ accounts, contracts, config }) => async ({
  coverId = 0,
  amount = parseEther('1'),
  coverPeriod = 0,
  payoutAsset = 0,
  ipfsProofHash = '',
  sender,
  value,
}) => {
  const [deposit] = await contracts.claims.getAssessmentDepositAndReward(amount, coverPeriod, payoutAsset);
  console.log({ deposit, value });
  return await contracts.claims.connect(sender || accounts[0]).submitClaim(coverId, amount, ipfsProofHash, {
    value: value || deposit,
  });
};

const stakeAndVoteOnEventType = (eventType, assessment, accounts) => async (userIndex, amount, id, accepted) => {
  const assessor = accounts[userIndex];
  await assessment.connect(assessor).depositStake(amount);
  await assessment.connect(assessor).castVote(eventType, id, accepted);
  if (eventType === EVENT_TYPE.CLAIM) {
    const claim = await assessment.claims(id);
    const { accepted, denied } = claim.poll;
    return { accepted, denied, totalTokens: accepted.add(denied) };
  }
  if (eventType === EVENT_TYPE.INCIDENT) {
    const incident = await assessment.incidents(id);
    const { accepted, denied } = incident.poll;
    return { accepted, denied, totalTokens: accepted.add(denied) };
  }
};

const getConfigurationStruct = ({ rewardRatio, minAssessmentDepositRatio }) => [rewardRatio, minAssessmentDepositRatio];

const getPollStruct = ({ accepted, denied, start, end }) => [accepted, denied, start, end];

const getVoteStruct = ({ accepted, denied, start, end }) => [accepted, denied, start, end];

const getClaimDetailsStruct = ({
  amount,
  coverId,
  coverPeriod,
  payoutAsset,
  nxmPriceSnapshot,
  minAssessmentDepositRatio,
  payoutRedeemed,
}) => [amount, coverId, coverPeriod, payoutAsset, nxmPriceSnapshot, minAssessmentDepositRatio, payoutRedeemed];

const getIncidentDetailsStruct = ({
  productId,
  date,
  payoutAsset,
  activeCoverAmount,
  expectedPayoutRatio,
  minAssessmentDepositRatio,
}) => [productId, date, payoutAsset, activeCoverAmount, expectedPayoutRatio, minAssessmentDepositRatio];

module.exports = {
  ASSET,
  STATUS,
  EVENT_TYPE,
  daysToSeconds,
  submitFraud,
  submitClaim,
  burnFraud,
  getPollStruct,
  getConfigurationStruct,
  getClaimDetailsStruct,
  getIncidentDetailsStruct,
  getVoteStruct,
  stakeAndVoteOnEventType,
};
