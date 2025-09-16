const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

describe('lockForMemberVote', function () {
  it('reverts if caller is not governor', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await expect(tokenController.lockForMemberVote(member.address, 1)).to.be.revertedWithCustomError(
      tokenController,
      'Unauthorized',
    );
  });

  it('locks member for voting', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, nxm } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const [governor] = fixture.accounts.governor;

    const isLockedBefore = await nxm.isLockedForMV(member.address);

    const block = await ethers.provider.getBlock('latest');
    const { timestamp } = block;
    await tokenController.connect(governor).lockForMemberVote(member.address, 3600);

    const isLockedAfter = await nxm.isLockedForMV(member.address);

    expect(isLockedBefore).to.be.equal(0);
    expect(isLockedAfter).to.be.equal(timestamp + 3600 + 1);
  });
});
