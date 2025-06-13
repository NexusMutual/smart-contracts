const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setEtherBalance } = require('../../utils/evm');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

async function withdrawNXMStakeAndRewardsSetup() {
  const fixture = await loadFixture(setup);
  const { stakingPoolFactory, tokenController } = fixture.contracts;
  const [member] = fixture.accounts.members;

  const createPoolTx = await stakingPoolFactory.create(AddressZero);
  const { events } = await createPoolTx.wait();
  const { poolId, stakingPoolAddress } = events[0].args;

  const poolSigner = await ethers.getImpersonatedSigner(stakingPoolAddress);
  await setEtherBalance(stakingPoolAddress, parseEther('1'));

  const depositAmount = parseEther('100');
  await tokenController.connect(poolSigner).depositStakedNXM(member.address, depositAmount, poolId);

  const rewardsAmount = parseEther('20');
  await tokenController.connect(poolSigner).mintStakingPoolNXMRewards(rewardsAmount, poolId);

  return {
    ...fixture,
    poolId,
    poolSigner,
  };
}

describe('withdrawNXMStakeAndRewards', function () {
  it('reverts if caller is not staking pool contract', async function () {
    const fixture = await loadFixture(withdrawNXMStakeAndRewardsSetup);
    const { tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const depositAmount = parseEther('50');
    const rewardsAmount = parseEther('10');
    await expect(
      tokenController.withdrawNXMStakeAndRewards(member.address, depositAmount, rewardsAmount, fixture.poolId),
    ).to.be.revertedWithCustomError(tokenController, 'OnlyStakingPool');
  });

  it('reduces staking pool deposits', async function () {
    const fixture = await loadFixture(withdrawNXMStakeAndRewardsSetup);
    const { tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const initialStakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);

    const depositAmount = parseEther('50');
    const rewardsAmount = 0;
    await tokenController
      .connect(fixture.poolSigner)
      .withdrawNXMStakeAndRewards(member.address, depositAmount, rewardsAmount, fixture.poolId);

    const stakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);
    expect(stakingPoolNXMBalances.deposits).to.equal(initialStakingPoolNXMBalances.deposits.sub(depositAmount));
    expect(stakingPoolNXMBalances.rewards).to.equal(initialStakingPoolNXMBalances.rewards);
  });

  it('reduces staking pool rewards', async function () {
    const fixture = await loadFixture(withdrawNXMStakeAndRewardsSetup);
    const { tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const initialStakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);

    const depositAmount = 0;
    const rewardsAmount = parseEther('10');
    await tokenController
      .connect(fixture.poolSigner)
      .withdrawNXMStakeAndRewards(member.address, depositAmount, rewardsAmount, fixture.poolId);

    const stakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);
    expect(stakingPoolNXMBalances.deposits).to.equal(initialStakingPoolNXMBalances.deposits);
    expect(stakingPoolNXMBalances.rewards).to.equal(initialStakingPoolNXMBalances.rewards.sub(rewardsAmount));
  });

  it('transfer nxm from the contract to the receiver', async function () {
    const fixture = await loadFixture(withdrawNXMStakeAndRewardsSetup);
    const { tokenController, nxm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const initialTcBalance = await nxm.balanceOf(tokenController.address);
    const initialUserBalance = await nxm.balanceOf(member.address);
    const initialStakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);

    const depositAmount = parseEther('50');
    const rewardsAmount = parseEther('10');
    const totalWithdrawn = depositAmount.add(rewardsAmount);

    await tokenController
      .connect(fixture.poolSigner)
      .withdrawNXMStakeAndRewards(member.address, depositAmount, rewardsAmount, fixture.poolId);

    const tcBalance = await nxm.balanceOf(tokenController.address);
    const userBalance = await nxm.balanceOf(member.address);
    const stakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);

    expect(stakingPoolNXMBalances.deposits).to.equal(initialStakingPoolNXMBalances.deposits.sub(depositAmount));
    expect(stakingPoolNXMBalances.rewards).to.equal(initialStakingPoolNXMBalances.rewards.sub(rewardsAmount));

    expect(userBalance).to.equal(initialUserBalance.add(totalWithdrawn));
    expect(tcBalance).to.equal(initialTcBalance.sub(totalWithdrawn));
  });
});
