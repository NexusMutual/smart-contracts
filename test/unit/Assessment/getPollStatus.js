const {ethers} = require('hardhat');
const {expectEvent} = require('@openzeppelin/test-helpers');
const {assert} = require('chai');

const STATUS = {
  PENDING: 0,
  ACCEPTED: 1,
  DENIED: 2,
};

const EVENT_TYPE = {
  CLAIM: 0,
  INCIDENT: 1
}

describe.only('getPollStatus', function () {

  it('should return ACCEPTED when a claim fraud resolution with accepting majority exists', async function () {

    const COVER_AMOUNT = parseEther('1'); // ETH ~ 100DAI
    const FLAT_ETH_FEE_PERC = await assessment.FLAT_ETH_FEE_PERC();
    const submissionFee = FLAT_ETH_FEE_PERC.mul(parseEther('1')).div('10000');
    const {assessment} = this;
    await assessment.submitClaimForAssessment(0, COVER_AMOUNT, false, '', {value: submissionFee});
    await assessment.submitClaimForAssessment(0, COVER_AMOUNT, false, '', {value: submissionFee});
    const status = await assessment.getPollStatus(EVENT_TYPE.CLAIM);
    assert(status = EVENT_TYPE.ACCEPTED);
  });

  it('should allow anyone to submit a proof for the same coverId', async function () {

    const {claimProofs} = this;

    const coverId = new BN(1);
    const ipfsHash = 'mockedIpfsHash';
    assert(await claimProofs.addProof(coverId, ipfsHash, {from: memberOne}));
    assert(await claimProofs.addProof(coverId, ipfsHash, {from: nonMember}));
    assert(await claimProofs.addProof(coverId, ipfsHash, {from: memberTwo}));

  });

  it('should allow someone to submit a proof multiple times', async function () {

    const {claimProofs} = this;

    const coverId = new BN(1);
    const ipfsHash = 'mockedIpfsHash';
    assert(await claimProofs.addProof(coverId, ipfsHash, {from: nonMember}));
    assert(await claimProofs.addProof(coverId, ipfsHash, {from: nonMember}));

  });

});
