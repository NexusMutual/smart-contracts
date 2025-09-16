const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { parseEther, MaxUint256, ZeroAddress } = ethers;

async function loadWithdrawNXMStakeAndRewardsFixture() {
  const fixture = await loadFixture(setup);
  const { stakingPoolFactory, tokenController, nxm } = fixture.contracts;
  const [member] = fixture.accounts.members;

  const createPoolTx = await stakingPoolFactory.create(ZeroAddress);
  const receipt = await createPoolTx.wait();
  const { poolId, stakingPoolAddress } = receipt.logs[0].args;

  const poolSigner = await ethers.getImpersonatedSigner(stakingPoolAddress);
  await setBalance(stakingPoolAddress, parseEther('1'));

  const amount = parseEther('100');
  await nxm.mint(member, amount);
  await nxm.connect(member).approve(tokenController, amount);
  await nxm.connect(member).approve(stakingPoolAddress, amount);
  await tokenController.connect(poolSigner).depositStakedNXM(member.address, amount, poolId);

  return { ...fixture, poolId, poolSigner };
}

describe('withdrawNXMStakeAndRewards', function () {
  it('reverts if caller is not stakingPool', async function () {
    const fixture = await loadFixture(loadWithdrawNXMStakeAndRewardsFixture);
    const { poolId } = fixture;
    const { tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await expect(
      tokenController.withdrawNXMStakeAndRewards(member.address, parseEther('1'), parseEther('1'), poolId),
    ).to.be.revertedWithCustomError(tokenController, 'OnlyStakingPool');
  });

  it('withdraw staked NXM and rewards', async function () {
    const fixture = await loadFixture(loadWithdrawNXMStakeAndRewardsFixture);
    const { poolSigner, poolId } = fixture;
    const { tokenController, nxm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const stake = parseEther('1');
    const rewards = parseEther('1');
    await nxm.connect(member).approve(tokenController, MaxUint256);

    const balanceBefore = await nxm.balanceOf(member.address);

    await tokenController.connect(poolSigner).mintStakingPoolNXMRewards(rewards, poolId);
    await tokenController.connect(poolSigner).withdrawNXMStakeAndRewards(member.address, stake, rewards, poolId);

    const balanceAfter = await nxm.balanceOf(member.address);

    expect(balanceAfter).to.be.equal(balanceBefore + stake + rewards);
  });
});
