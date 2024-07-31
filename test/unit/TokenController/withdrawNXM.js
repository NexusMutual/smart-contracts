const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');
const { ethers } = require('hardhat');

const setup = require('./setup');

const { parseEther, formatBytes32String } = ethers.utils;

const ONE_DAY_SECONDS = 24 * 60 * 60;

async function withdrawNXMSetup() {
  const fixture = await loadFixture(setup);
  const { nxm, tokenController } = fixture.contracts;
  const [member] = fixture.accounts.members;

  await nxm.connect(member).approve(tokenController.address, ethers.constants.MaxUint256);

  const stakingPoolDeposit = { tokenIds: [], tokenTrancheIds: [] };
  const v1CoverNotes = { coverIds: [1], reasonIndexes: [0] };
  const batchSize = 100;

  return {
    ...fixture,
    params: {
      stakingPoolDeposit,
      v1CoverNotes,
      batchSize,
    },
  };
}

async function govAndV1StakeRewardsSetup() {
  const fixture = await loadFixture(withdrawNXMSetup);
  const { governance, tokenController, pooledStaking: legacyPooledStaking } = fixture.contracts;
  const [member] = fixture.accounts.members;

  // Governance rewards
  await governance.setUnclaimedGovernanceRewards(member.address, parseEther('1'));

  // V1 Cover Notes (0 lockReasonIndex)
  const encodedData = ethers.utils.solidityPack(['string', 'address', 'uint256'], ['CN', member.address, 1]);
  await tokenController.lock(member.address, ethers.utils.keccak256(encodedData), parseEther('1'), ONE_DAY_SECONDS);

  // V1 Claim Assessment (1 lockReasonIndex)
  await tokenController.lock(member.address, formatBytes32String('CLA'), parseEther('1'), ONE_DAY_SECONDS);

  // V1 Legacy Pooled Staking stake / rewards
  await legacyPooledStaking.setStakerDeposit(member.address, parseEther('1'));
  await legacyPooledStaking.setStakerReward(member.address, parseEther('1'));

  return fixture;
}

function setWithdrawalOptions(withdrawalOptions) {
  const allFalse = {
    assessmentStake: false,
    stakingPoolStake: false,
    assessmentRewards: false,
    stakingPoolRewards: false,
    governanceRewards: false,
    v1CoverNotes: false,
    v1PooledStakingStake: false,
  };

  if (withdrawalOptions.all === false) {
    return allFalse;
  }

  // set individual options
  return {
    ...allFalse,
    ...withdrawalOptions,
  };
}

describe('withdrawNXM', function () {
  it('should revert if member withdraws governance rewards but has none', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { tokenController, governance } = fixture.contracts;
    const { stakingPoolDeposit, v1CoverNotes, batchSize } = fixture.params;
    const [member] = fixture.accounts.members;

    const governanceRewards = await governance.getPendingReward(member.address);
    expect(governanceRewards.toString()).to.equal('0');

    // set only withdrawNXMOptions.governanceRewards to true
    const withdrawNXMOptions = setWithdrawalOptions({ governanceRewards: true });
    const withdrawNXMParams = [stakingPoolDeposit, v1CoverNotes, batchSize, withdrawNXMOptions];
    const withdrawNXM = tokenController.connect(member).withdrawNXM(...withdrawNXMParams);

    await expect(withdrawNXM).to.be.revertedWith('TokenController: No withdrawable governance rewards');
  });

  it('should revert if member withdraws v1 cover notes but has none', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { tokenController } = fixture.contracts;
    const { stakingPoolDeposit, v1CoverNotes, batchSize } = fixture.params;
    const [member] = fixture.accounts.members;

    const encodedData = ethers.utils.solidityPack(['string', 'address', 'uint256'], ['CN', member.address, 1]);
    const coverNoteReason = ethers.utils.keccak256(encodedData);

    const coverNotesAmount = await tokenController.tokensLocked(member.address, coverNoteReason);
    expect(coverNotesAmount.toString()).to.equal('0');

    // set only withdrawNXMOptions.v1CoverNotes to true
    const withdrawNXMOptions = setWithdrawalOptions({ v1CoverNotes: true });
    const withdrawNXMParams = [stakingPoolDeposit, v1CoverNotes, batchSize, withdrawNXMOptions];
    const withdrawNXM = tokenController.connect(member).withdrawNXM(...withdrawNXMParams);

    await expect(withdrawNXM).to.be.revertedWith('TokenController: No locked cover notes found');
  });

  it('should ALWAYS withdraw v1 claim assessment tokens', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { nxm, tokenController } = fixture.contracts;
    const { stakingPoolDeposit, v1CoverNotes, batchSize } = fixture.params;
    const [member] = fixture.accounts.members;

    // lock claim assessment tokens for member
    const claimAssessmentReason = formatBytes32String('CLA');
    const lockedAmount = parseEther('1');
    await tokenController.lock(member.address, claimAssessmentReason, lockedAmount, ONE_DAY_SECONDS);

    const balanceBefore = await nxm.balanceOf(member.address);

    const v1ClaimAssessmentTokensBefore = await tokenController.tokensLocked(member.address, claimAssessmentReason);
    expect(v1ClaimAssessmentTokensBefore).to.equal(lockedAmount);

    // set false to ALL withdraw options - should still withdraw v1 claim assessment tokens
    const withdrawNXMOptions = setWithdrawalOptions({ all: false });
    await tokenController.connect(member).withdrawNXM(stakingPoolDeposit, v1CoverNotes, batchSize, withdrawNXMOptions);

    const balanceAfter = await nxm.balanceOf(member.address);
    const v1ClaimAssessmentTokensAfter = await tokenController.tokensLocked(member.address, claimAssessmentReason);

    expect(balanceAfter).to.equal(balanceBefore.add(lockedAmount));
    expect(v1ClaimAssessmentTokensAfter.toString()).to.equal('0');
  });

  it('should ALWAYS withdraw v1 pooled staking rewards', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { nxm, tokenController, pooledStaking: legacyPooledStaking } = fixture.contracts;
    const { stakingPoolDeposit, v1CoverNotes, batchSize } = fixture.params;
    const [member] = fixture.accounts.members;

    // set staker rewards
    const stakerRewards = parseEther('1');
    await legacyPooledStaking.setStakerReward(member.address, stakerRewards);

    const balanceBefore = await nxm.balanceOf(member.address);

    const legacyPooledStakingRewardsBefore = await legacyPooledStaking.stakerReward(member.address);
    expect(legacyPooledStakingRewardsBefore).to.equal(stakerRewards);

    // set false to ALL withdraw options - should still withdraw v1 pooled staking rewards
    const withdrawNXMOptions = setWithdrawalOptions({ all: false });
    await tokenController.connect(member).withdrawNXM(stakingPoolDeposit, v1CoverNotes, batchSize, withdrawNXMOptions);

    const balanceAfter = await nxm.balanceOf(member.address);
    const legacyPooledStakingRewardsAfter = await legacyPooledStaking.stakerReward(member.address);

    expect(balanceAfter).to.equal(balanceBefore.add(stakerRewards));
    expect(legacyPooledStakingRewardsAfter.toString()).to.equal('0');
  });

  it('withdraws governance rewards if withdrawNXMOptions.governanceRewards is true', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { nxm, governance, tokenController } = fixture.contracts;
    const { stakingPoolDeposit, v1CoverNotes, batchSize } = fixture.params;
    const [member] = fixture.accounts.members;

    // set governance rewards
    const governanceRewards = parseEther('1');
    await governance.setUnclaimedGovernanceRewards(member.address, governanceRewards);

    const balanceBefore = await nxm.balanceOf(member.address);

    const governanceRewardsBefore = await governance.getPendingReward(member.address);
    expect(governanceRewardsBefore.toString()).to.equal(governanceRewards);

    // set only withdrawNXMOptions.governanceRewards to true
    const withdrawNXMOptions = setWithdrawalOptions({ governanceRewards: true });
    await tokenController.connect(member).withdrawNXM(stakingPoolDeposit, v1CoverNotes, batchSize, withdrawNXMOptions);

    const balanceAfter = await nxm.balanceOf(member.address);
    const governanceRewardsAfter = await governance.getPendingReward(member.address);

    expect(balanceAfter).to.equal(balanceBefore.add(governanceRewardsBefore));
    expect(governanceRewardsAfter.toString()).to.equal('0');
  });

  it('withdraws stake in v1 pooled staking if withdrawNXMOptions.v1PooledStakingStake is true', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { nxm, tokenController, pooledStaking: legacyPooledStaking } = fixture.contracts;
    const { stakingPoolDeposit, v1CoverNotes, batchSize } = fixture.params;
    const [member] = fixture.accounts.members;

    // set v1 pooled staking deposit
    const stakerDeposit = parseEther('1');
    await legacyPooledStaking.setStakerDeposit(member.address, stakerDeposit);

    const balanceBefore = await nxm.balanceOf(member.address);

    const legacyPooledStakingDepositBefore = await legacyPooledStaking.stakerDeposit(member.address);
    expect(legacyPooledStakingDepositBefore).to.equal(stakerDeposit);

    // set only withdrawNXMOptions.v1PooledStakingStake to true
    const withdrawNXMOptions = setWithdrawalOptions({ v1PooledStakingStake: true });
    await tokenController.connect(member).withdrawNXM(stakingPoolDeposit, v1CoverNotes, batchSize, withdrawNXMOptions);

    const balanceAfter = await nxm.balanceOf(member.address);
    const legacyPooledStakingDepositAfter = await legacyPooledStaking.stakerDeposit(member.address);

    expect(balanceAfter).to.equal(balanceBefore.add(legacyPooledStakingDepositBefore));
    expect(legacyPooledStakingDepositAfter.toString()).to.equal('0');
  });

  it('should withdraw v1 cover notes if withdrawNXMOptions.v1CoverNote is true', async function () {
    const fixture = await loadFixture(withdrawNXMSetup);
    const { nxm, tokenController } = fixture.contracts;
    const { stakingPoolDeposit, v1CoverNotes, batchSize } = fixture.params;
    const [member] = fixture.accounts.members;

    // set v1 cover notes
    const coverNoteAmount = parseEther('1');
    const encodedData = ethers.utils.solidityPack(['string', 'address', 'uint256'], ['CN', member.address, 1]);
    const coverNoteReason = ethers.utils.keccak256(encodedData);
    await tokenController.lock(member.address, coverNoteReason, coverNoteAmount, ONE_DAY_SECONDS);

    const balanceBefore = await nxm.balanceOf(member.address);

    const coverNotesAmountBefore = await tokenController.tokensLocked(member.address, coverNoteReason);
    expect(coverNotesAmountBefore).to.equal(coverNoteAmount);

    // set only withdrawNXMOptions.v1CoverNote to true
    const withdrawNXMOptions = setWithdrawalOptions({ v1CoverNotes: true });
    await tokenController.connect(member).withdrawNXM(stakingPoolDeposit, v1CoverNotes, batchSize, withdrawNXMOptions);

    const balanceAfter = await nxm.balanceOf(member.address);
    const coverNotesAmountAfter = await tokenController.tokensLocked(member.address, coverNoteReason);

    expect(balanceAfter).to.equal(balanceBefore.add(coverNotesAmountBefore));
    expect(coverNotesAmountAfter.toString()).to.equal('0');
  });

  it('should withdraw any withdrawNXMOptions that is set to true', async function () {
    const fixture = await loadFixture(govAndV1StakeRewardsSetup);
    const { nxm, governance, tokenController, pooledStaking: legacyPooledStaking } = fixture.contracts;
    const { stakingPoolDeposit, v1CoverNotes, batchSize } = fixture.params;
    const [member] = fixture.accounts.members;

    const balanceBefore = await nxm.balanceOf(member.address);

    // Lock reasons
    const encodedData = ethers.utils.solidityPack(['string', 'address', 'uint256'], ['CN', member.address, 1]);
    const coverNoteReason = ethers.utils.keccak256(encodedData);
    const claimAssessmentReason = formatBytes32String('CLA');

    // must set true in withdrawNXMOptions
    const governanceRewardsBefore = await governance.getPendingReward(member.address);
    const coverNotesAmountBefore = await tokenController.tokensLocked(member.address, coverNoteReason);
    const legacyPooledStakingDepositBefore = await legacyPooledStaking.stakerDeposit(member.address);

    // defaults to always withdraw
    const v1ClaimAssessmentTokensBefore = await tokenController.tokensLocked(member.address, claimAssessmentReason);
    const legacyPooledStakingRewardsBefore = await legacyPooledStaking.stakerReward(member.address);

    // set governanceRewards, v1 cover note and v1 pooled staking stake to true
    const withdrawNXMOptions = setWithdrawalOptions({
      governanceRewards: true,
      v1CoverNotes: true,
      v1PooledStakingStake: true,
    });
    await tokenController.connect(member).withdrawNXM(stakingPoolDeposit, v1CoverNotes, batchSize, withdrawNXMOptions);

    const balanceAfter = await nxm.balanceOf(member.address);
    expect(balanceAfter).to.equal(
      balanceBefore
        .add(governanceRewardsBefore)
        .add(coverNotesAmountBefore)
        .add(legacyPooledStakingDepositBefore)
        .add(v1ClaimAssessmentTokensBefore)
        .add(legacyPooledStakingRewardsBefore),
    );

    const coverNotesAmountAfter = await tokenController.tokensLocked(member.address, coverNoteReason);
    const governanceRewardsAfter = await governance.getPendingReward(member.address);
    const v1ClaimAssessmentTokensAfter = await tokenController.tokensLocked(member.address, claimAssessmentReason);
    const legacyPooledStakingRewardsAfter = await legacyPooledStaking.stakerReward(member.address);
    const legacyPooledStakingDepositAfter = await legacyPooledStaking.stakerDeposit(member.address);

    expect(coverNotesAmountAfter.toString()).to.equal('0');
    expect(governanceRewardsAfter.toString()).to.equal('0');
    expect(v1ClaimAssessmentTokensAfter.toString()).to.equal('0');
    expect(legacyPooledStakingRewardsAfter.toString()).to.equal('0');
    expect(legacyPooledStakingDepositAfter.toString()).to.equal('0');
  });
});
