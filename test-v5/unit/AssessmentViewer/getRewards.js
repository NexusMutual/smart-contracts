const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { expect } = require('chai');

const { setup } = require('./setup');

const { parseEther } = ethers.utils;

describe('getRewards', function () {
  it('getRewards return assessmentRewards', async function () {
    const fixture = await loadFixture(setup);
    const [member] = fixture.accounts.members;
    const { assessment, assessmentViewer } = fixture.contracts;

    const totalPendingAmountInNXM = parseEther('1');
    const withdrawableAmountInNXM = parseEther('2');
    const withdrawableUntilIndex = 1;
    await assessment.setRewards(totalPendingAmountInNXM, withdrawableAmountInNXM, withdrawableUntilIndex);

    const assessmentRewards = await assessmentViewer.getRewards(member.address);
    expect(assessmentRewards.totalPendingAmountInNXM).to.equal(totalPendingAmountInNXM);
    expect(assessmentRewards.withdrawableAmountInNXM).to.equal(withdrawableAmountInNXM);
    expect(assessmentRewards.withdrawableUntilIndex.toString()).to.equal('1');
  });
});
