const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const { nexusViewerSetup } = require('./setup');
const { increaseTime } = require('../utils').evm;

describe('getClaimableNxm', function () {
  it('should return 0 rewards and stake if the stake is still locked', async function () {
    const fixture = await loadFixture(nexusViewerSetup);
    const { nexusViewer } = fixture.contracts;
    const [manager1] = fixture.accounts.stakingPoolManagers;
    const { tokenIds } = fixture;

    const claimableNXM = await nexusViewer.getClaimableNXM(manager1.address, tokenIds);

    expect(claimableNXM.governanceRewards.toString()).to.equal('0');
    expect(claimableNXM.assessmentRewards.toString()).to.equal('0');
    expect(claimableNXM.assessmentStake.toString()).to.equal('0');
    expect(claimableNXM.stakingPoolTotalRewards.toString()).to.equal('0');
    expect(claimableNXM.stakingPoolTotalExpiredStake.toString()).to.equal('0');
    expect(claimableNXM.managerTotalRewards.toString()).to.equal('0');
    expect(claimableNXM.legacyClaimAssessmentTokens.toString()).to.equal('0');
  });

  it('should return all claimable NXM from the platform', async function () {
    const fixture = await loadFixture(nexusViewerSetup);
    const { nexusViewer, stakingViewer } = fixture.contracts;
    const [manager1] = fixture.accounts.stakingPoolManagers;
    const { tokenIds, stakeAmount } = fixture;

    // expire cover buckets to make rewards claimable
    const BUCKET_DURATION = 28 * 24 * 60 * 60;
    await increaseTime(BUCKET_DURATION * 24);
    await stakingViewer.processExpirationsFor(fixture.tokenIds);

    const claimableNXM = await nexusViewer.getClaimableNXM(manager1.address, tokenIds);

    expect(claimableNXM.governanceRewards.toString()).to.equal('0');
    expect(claimableNXM.assessmentRewards.gt('52294014150374230')).to.equal(true);
    expect(claimableNXM.assessmentStake.toString()).to.equal(stakeAmount);
    expect(claimableNXM.stakingPoolTotalRewards.gt('38157876700000000')).to.equal(true);
    expect(claimableNXM.stakingPoolTotalExpiredStake.toString()).to.equal(stakeAmount.mul(3));
    expect(claimableNXM.managerTotalRewards.gt('670145200000000')).to.equal(true);
    expect(claimableNXM.legacyClaimAssessmentTokens.toString()).to.equal('0');
  });
});
