const { ethers } = require('hardhat');
const { expect } = require('chai');
const { toBytes8 } = require('../../../lib/helpers');
const { parseEther } = require('ethers/lib/utils');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');
const { impersonateAccount, setEtherBalance } = require('../../utils').evm;

async function updateUintParametersSetup() {
  const fixture = await loadFixture(setup);
  const { gv: governance } = fixture.contracts;
  await impersonateAccount(governance.address);
  await setEtherBalance(governance.address, parseEther('1000'));
  const governanceSigner = await ethers.provider.getSigner(governance.address);

  return {
    ...fixture,
    governanceSigner,
  };
}

describe('updateUintParameters', function () {
  it('should update tokenHoldingTime', async function () {
    const fixture = await loadFixture(updateUintParametersSetup);
    const { governanceSigner } = fixture;
    const { gv: governance } = fixture.contracts;
    const { val: tokenHoldingTimeBefore } = await governance.getUintParameters(toBytes8('GOVHOLD'));

    await governance.connect(governanceSigner).updateUintParameters(toBytes8('GOVHOLD'), 4 * 24 * 3600);
    const { val: tokenHoldingTimeAfter } = await governance.getUintParameters(toBytes8('GOVHOLD'));

    expect(tokenHoldingTimeBefore).not.to.be.equal(tokenHoldingTimeAfter);
    expect(tokenHoldingTimeAfter).to.be.equal(4 * 24 * 3600);
  });

  it('should update maxDraftTime', async function () {
    const fixture = await loadFixture(updateUintParametersSetup);
    const { governanceSigner } = fixture;
    const { gv: governance } = fixture.contracts;
    const { val: maxDraftTimeBefore } = await governance.getUintParameters(toBytes8('MAXDRFT'));

    await governance.connect(governanceSigner).updateUintParameters(toBytes8('MAXDRFT'), 4 * 24 * 3600);
    const { val: maxDraftTimeAfter } = await governance.getUintParameters(toBytes8('MAXDRFT'));

    expect(maxDraftTimeBefore).not.to.be.equal(maxDraftTimeAfter);
    expect(maxDraftTimeAfter).to.be.equal(4 * 24 * 3600);
  });

  it('should update maxFollowers', async function () {
    const fixture = await loadFixture(updateUintParametersSetup);
    const { governanceSigner } = fixture;
    const { gv: governance } = fixture.contracts;
    const { val: maxDraftTimeBefore } = await governance.getUintParameters(toBytes8('MAXFOL'));

    await governance.connect(governanceSigner).updateUintParameters(toBytes8('MAXFOL'), 45);
    const { val: maxDraftTimeAfter } = await governance.getUintParameters(toBytes8('MAXFOL'));

    expect(maxDraftTimeBefore).not.to.be.equal(maxDraftTimeAfter);
    expect(maxDraftTimeAfter).to.be.equal(45);
  });

  it('should update actionWaitingTime', async function () {
    const fixture = await loadFixture(updateUintParametersSetup);
    const { governanceSigner } = fixture;
    const { gv: governance } = fixture.contracts;
    const { val: actionWaitingTimeBefore } = await governance.getUintParameters(toBytes8('ACWT'));

    await governance.connect(governanceSigner).updateUintParameters(toBytes8('ACWT'), 12 * 3600);
    const { val: actionWaitingTimeAfter } = await governance.getUintParameters(toBytes8('ACWT'));

    expect(actionWaitingTimeBefore).not.to.be.equal(actionWaitingTimeAfter);
    expect(actionWaitingTimeAfter).to.be.equal(12 * 3600);
  });

  it('should update roleIdAllowedToCatgorize', async function () {
    const fixture = await loadFixture(updateUintParametersSetup);
    const { governanceSigner } = fixture;
    const { gv: governance } = fixture.contracts;
    const { val: roleIdAllowedToCatgorizeBefore } = await governance.getUintParameters(toBytes8('CATROLE'));

    await governance.connect(governanceSigner).updateUintParameters(toBytes8('CATROLE'), 2);
    const { val: roleIdAllowedToCatgorizeAfter } = await governance.getUintParameters(toBytes8('CATROLE'));

    expect(roleIdAllowedToCatgorizeBefore).not.to.be.equal(roleIdAllowedToCatgorizeAfter);
    expect(roleIdAllowedToCatgorizeAfter).to.be.equal(2);
  });

  it('should update maxVoteWeigthPer', async function () {
    const fixture = await loadFixture(updateUintParametersSetup);
    const { governanceSigner } = fixture;
    const { gv: governance } = fixture.contracts;
    const { val: maxVoteWeigthPerBefore } = await governance.getUintParameters(toBytes8('MAXVTW'));

    await governance.connect(governanceSigner).updateUintParameters(toBytes8('MAXVTW'), 10);
    const { val: maxVoteWeigthPerAfter } = await governance.getUintParameters(toBytes8('MAXVTW'));

    expect(maxVoteWeigthPerBefore).not.to.be.equal(maxVoteWeigthPerAfter);
    expect(maxVoteWeigthPerAfter).to.be.equal(10);
  });

  it('should update specialResolutionMajPerc', async function () {
    const fixture = await loadFixture(updateUintParametersSetup);
    const { governanceSigner } = fixture;
    const { gv: governance } = fixture.contracts;
    const { val: specialResolutionMajPercBefore } = await governance.getUintParameters(toBytes8('SPRESM'));

    await governance.connect(governanceSigner).updateUintParameters(toBytes8('SPRESM'), 80);
    const { val: specialResolutionMajPercAfter } = await governance.getUintParameters(toBytes8('SPRESM'));

    expect(specialResolutionMajPercBefore).not.to.be.equal(specialResolutionMajPercAfter);
    expect(specialResolutionMajPercAfter).to.be.equal(80);
  });
});
