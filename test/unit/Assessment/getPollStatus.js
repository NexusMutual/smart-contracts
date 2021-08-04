const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const { submitClaim, submitFraud, burnFraud } = require('./helpers');

const { parseEther } = ethers.utils;

const STATUS = {
  PENDING: 0,
  ACCEPTED: 1,
  DENIED: 2,
};

const EVENT_TYPE = {
  CLAIM: 0,
  INCIDENT: 1,
};

const formatStatus = x =>
  (x === STATUS.PENDING && 'PENDING') || (x === STATUS.ACCEPTED && 'ACCEPTED') || (x === STATUS.DENIED && 'DENIED');

const expectStatus = assessment => async expected => {
  const status = await assessment.getPollStatus(EVENT_TYPE.CLAIM, 0);
  assert(status === expected, `Expected status to be ${formatStatus(expected)} but got ${formatStatus(status)}`);
};

// Converts days to seconds
const days = numberOfDays => numberOfDays * 24 * 60 * 60;

describe('getPollStatus', function () {
  it('should return PENDING when the poll is still open', async function () {
    const { assessment } = this.contracts;
    const expect = expectStatus(assessment);
    await submitClaim(assessment)(0);

    await expect(STATUS.PENDING);

    await time.increase(days(1));
    await expect(STATUS.PENDING);

    await time.increase(days(1));
    await assessment.connect(this.accounts[1]).depositStake(parseEther('10'));
    await assessment.connect(this.accounts[1]).castVote(EVENT_TYPE.CLAIM, 0, true);
    await expect(STATUS.PENDING);

    await time.increase(days(1));
    await assessment.connect(this.accounts[2]).depositStake(parseEther('100'));
    await assessment.connect(this.accounts[2]).castVote(EVENT_TYPE.CLAIM, 0, false);
    await expect(STATUS.PENDING);

    await time.increase(days(1));
    await expect(STATUS.PENDING);

    await time.increase(days(1));
    await expect(STATUS.PENDING);
  });

  it('should return DENIED when the poll ends with no votes', async function () {
    const { assessment } = this.contracts;
    const expect = expectStatus(assessment);
    await submitClaim(assessment)(0);

    await time.increase(days(3) + 1);
    await expect(STATUS.DENIED);
  });

  it('should return DENIED when the poll result is to deny', async function () {
    const { assessment } = this.contracts;
    const expect = expectStatus(assessment);
    await submitClaim(assessment)(0);

    await assessment.connect(this.accounts[1]).depositStake(parseEther('10'));
    await assessment.connect(this.accounts[1]).castVote(EVENT_TYPE.CLAIM, 0, true);

    await assessment.connect(this.accounts[2]).depositStake(parseEther('100'));
    await assessment.connect(this.accounts[2]).castVote(EVENT_TYPE.CLAIM, 0, false);

    await time.increase(days(30));

    await expect(STATUS.DENIED);
  });

  it('should return DENIED when a claim fraud resolution with denying majority exists', async function () {
    const { assessment } = this.contracts;
    const expect = expectStatus(assessment);
    await submitClaim(assessment)(0);

    const fraudulentAssessor = this.accounts[2];
    await assessment.connect(fraudulentAssessor).depositStake(parseEther('100'));
    await assessment.connect(fraudulentAssessor).castVote(EVENT_TYPE.CLAIM, 0, true);

    const honestAssessor = this.accounts[1];
    await assessment.connect(honestAssessor).depositStake(parseEther('10'));
    await assessment.connect(honestAssessor).castVote(EVENT_TYPE.CLAIM, 0, false);

    const governance = this.accounts[0];
    const fraudulentAssessors = [fraudulentAssessor.address];
    const burnAmounts = [parseEther('100')];
    const merkleTree = await submitFraud(assessment)(governance, fraudulentAssessors, burnAmounts);
    await burnFraud(assessment)(0, fraudulentAssessors, burnAmounts, 1, merkleTree);
    await time.increase(days(30));

    await expect(STATUS.DENIED);
  });

  it('should return ACCEPTED when the poll result is to accept', async function () {
    const { assessment } = this.contracts;
    const expect = expectStatus(assessment);
    await submitClaim(assessment)(0);

    await assessment.connect(this.accounts[1]).depositStake(parseEther('100'));
    await assessment.connect(this.accounts[1]).castVote(EVENT_TYPE.CLAIM, 0, true);

    await assessment.connect(this.accounts[2]).depositStake(parseEther('10'));
    await assessment.connect(this.accounts[2]).castVote(EVENT_TYPE.CLAIM, 0, false);

    await time.increase(days(30));

    await expect(STATUS.ACCEPTED);
  });

  it('should return ACCEPTED when a claim fraud resolution with accepting majority exists', async function () {
    const { assessment } = this.contracts;
    const expect = expectStatus(assessment);
    await submitClaim(assessment)(0);

    const honestAssessor = this.accounts[1];
    await assessment.connect(honestAssessor).depositStake(parseEther('10'));
    await assessment.connect(honestAssessor).castVote(EVENT_TYPE.CLAIM, 0, true);

    const fraudulentAssessor = this.accounts[2];
    await assessment.connect(fraudulentAssessor).depositStake(parseEther('100'));
    await assessment.connect(fraudulentAssessor).castVote(EVENT_TYPE.CLAIM, 0, false);

    const governance = this.accounts[0];
    const fraudulentAssessors = [fraudulentAssessor.address];
    const burnAmounts = [parseEther('100')];
    const merkleTree = await submitFraud(assessment)(governance, fraudulentAssessors, burnAmounts);
    await burnFraud(assessment)(0, fraudulentAssessors, burnAmounts, 1, merkleTree);
    await time.increase(days(30));

    await expect(STATUS.ACCEPTED);
  });
});
