const { ethers } = require('hardhat');
const keccak256 = require('keccak256');
const { MerkleTree } = require('merkletreejs');
const { parseEther, arrayify, hexZeroPad, hexValue } = ethers.utils;
const { BigNumber } = ethers;

const EVENT_TYPE = {
  CLAIM: 0,
  INCIDENT: 1,
};

const STATUS = {
  PENDING: 0,
  ACCEPTED: 1,
  DENIED: 2,
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

const submitClaim = assessment => async (id, amount) => {
  const DEFAULT_COVER_AMOUNT = parseEther('1');
  const config = await assessment.CONFIG();
  const { CLAIM_ASSESSMENT_DEPOSIT_PERC } = config;
  const claimAssessmentDeposit = parseEther('1')
    .mul(CLAIM_ASSESSMENT_DEPOSIT_PERC)
    .div('10000');
  await assessment.submitClaim(id, amount || DEFAULT_COVER_AMOUNT, false, '', { value: claimAssessmentDeposit });
};

const submitIncident = assessment => async (id, priceBefore, date) => {
  const config = await assessment.CONFIG();
  const { INCIDENT_ASSESSMENT_DEPOSIT_PERC } = config;
  // [todo] Change this to an estimate when incidents can be submitted by all members
  const payoutImpact = Zero;
  // [todo] Use this to approve amount of nxm to dpeosit contract
  // const incidentAssessmentDeposit = payoutImpact.mul(INCIDENT_ASSESSMENT_DEPOSIT_PERC).div('10000');
  await assessment.submitClaim(id, priceBefore, date);
};

const getDurationByTokenWeight = (MIN_VOTING_PERIOD_DAYS, MAX_VOTING_PERIOD_DAYS) => (tokens, payoutImpact) => {
  const MULTIPLIER = '10'; // 10x the cover amount
  let tokenDrivenStrength = tokens.mul(parseEther('1')).div(payoutImpact.mul(MULTIPLIER));
  // tokenDrivenStrength is capped at 1 i.e. 100%
  tokenDrivenStrength = tokenDrivenStrength.gt(parseEther('1')) ? parseEther('1') : tokenDrivenStrength;
  return BigNumber.from(daysToSeconds(MIN_VOTING_PERIOD_DAYS).toString())
    .add(
      BigNumber.from(daysToSeconds(MAX_VOTING_PERIOD_DAYS - MIN_VOTING_PERIOD_DAYS).toString())
        .mul(parseEther('1').sub(tokenDrivenStrength))
        .div(parseEther('1')),
    )
    .toNumber();
};

const getDurationByConsensus = (MIN_VOTING_PERIOD_DAYS, MAX_VOTING_PERIOD_DAYS) => ({ accepted, denied }) => {
  if (accepted.isZero()) return daysToSeconds(MAX_VOTING_PERIOD_DAYS);
  const consensusStrength = accepted
    .mul(parseEther('2'))
    .div(accepted.add(denied))
    .sub(parseEther('1'))
    .abs();
  return parseEther(daysToSeconds(MIN_VOTING_PERIOD_DAYS).toString())
    .add(
      parseEther(daysToSeconds(MAX_VOTING_PERIOD_DAYS - MIN_VOTING_PERIOD_DAYS).toString())
        .mul(parseEther('1').sub(consensusStrength))
        .div(parseEther('1')),
    )
    .div(parseEther('1'))
    .toNumber();
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

const getConfigurationStruct = ({
  MIN_VOTING_PERIOD_DAYS,
  MAX_VOTING_PERIOD_DAYS,
  PAYOUT_COOLDOWN_DAYS,
  REWARD_PERC,
  INCIDENT_IMPACT_ESTIMATE_PERC,
  CLAIM_ASSESSMENT_DEPOSIT_PERC,
  INCIDENT_ASSESSMENT_DEPOSIT_PERC,
}) => [
  MIN_VOTING_PERIOD_DAYS,
  MAX_VOTING_PERIOD_DAYS,
  PAYOUT_COOLDOWN_DAYS,
  REWARD_PERC,
  INCIDENT_IMPACT_ESTIMATE_PERC,
  CLAIM_ASSESSMENT_DEPOSIT_PERC,
  INCIDENT_ASSESSMENT_DEPOSIT_PERC,
  0, // unused
];

const getPollStruct = ({ accepted, denied, start, end }) => [accepted, denied, start, end];

const getVoteStruct = ({ accepted, denied, start, end }) => [accepted, denied, start, end];

const getClaimDetailsStruct = ({
  amount,
  coverId,
  coverPeriod,
  payoutAsset,
  nxmPriceSnapshot,
  assessmentDepositPerc,
  payoutRedeemed,
}) => [amount, coverId, coverPeriod, payoutAsset, nxmPriceSnapshot, assessmentDepositPerc, payoutRedeemed];

const getIncidentDetailsStruct = ({
  productId,
  date,
  payoutAsset,
  activeCoverAmount,
  impactEstimatePerc,
  assessmentDepositPerc,
  depositRedeemed,
}) => [productId, date, payoutAsset, activeCoverAmount, impactEstimatePerc, assessmentDepositPerc, depositRedeemed];

module.exports = {
  STATUS,
  EVENT_TYPE,
  daysToSeconds,
  submitFraud,
  submitClaim,
  submitIncident,
  burnFraud,
  getPollStruct,
  getConfigurationStruct,
  getClaimDetailsStruct,
  getIncidentDetailsStruct,
  getVoteStruct,
  getDurationByTokenWeight,
  getDurationByConsensus,
  stakeAndVoteOnEventType,
};
