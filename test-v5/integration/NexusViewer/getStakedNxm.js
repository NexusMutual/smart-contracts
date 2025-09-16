const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const { nexusViewerSetup } = require('./setup');
const { increaseTime } = require('../utils').evm;

describe('getStakedNXM', function () {
  it('should return all staked NXM from the platform', async function () {
    const fixture = await loadFixture(nexusViewerSetup);
    const { nexusViewer } = fixture.contracts;
    const { tokenIds, stakeAmount } = fixture;
    const [manager1] = fixture.accounts.stakingPoolManagers;

    const stakedNxm = await nexusViewer.getStakedNXM(manager1.address, tokenIds);

    expect(stakedNxm.stakingPoolTotalActiveStake).to.equal(stakeAmount.mul(3));
    expect(stakedNxm.assessmentStake.toString()).to.equal(stakeAmount);
    expect(stakedNxm.assessmentRewards.gt('52291049175836673')).to.equal(true);
  });

  it('should return 0 active stake and rewards if the stake is NOT locked', async function () {
    const fixture = await loadFixture(nexusViewerSetup);
    const { nexusViewer, stakingViewer } = fixture.contracts;
    const { tokenIds } = fixture;
    const [manager1] = fixture.accounts.stakingPoolManagers;

    // expire cover buckets to make rewards claimable
    const BUCKET_DURATION = 28 * 24 * 60 * 60;
    await increaseTime(BUCKET_DURATION * 24);
    await stakingViewer.processExpirationsFor(fixture.tokenIds);

    const stakedNXM = await nexusViewer.getStakedNXM(manager1.address, tokenIds);

    expect(stakedNXM.stakingPoolTotalActiveStake).to.equal('0');
    expect(stakedNXM.assessmentStake.toString()).to.equal('0');
    expect(stakedNXM.assessmentRewards.toString()).to.equal('0');
  });

  it('should return a result if the user has no NFT tokens', async function () {
    const fixture = await loadFixture(nexusViewerSetup);
    const { nexusViewer } = fixture.contracts;
    const memberNoNft = fixture.accounts.members[3];

    const stakedNXM = await nexusViewer.getStakedNXM(memberNoNft.address, []);

    expect(stakedNXM.stakingPoolTotalActiveStake).to.equal('0');
    expect(stakedNXM.assessmentStake.toString()).to.equal('0');
    expect(stakedNXM.assessmentRewards.toString()).to.equal('0');
  });
});
