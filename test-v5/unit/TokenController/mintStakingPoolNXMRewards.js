const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setEtherBalance } = require('../../utils/evm');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

async function mintStakingPoolNXMRewardsSetup() {
  const fixture = await loadFixture(setup);
  const { stakingPoolFactory } = fixture.contracts;

  const createPoolTx = await stakingPoolFactory.create(AddressZero);
  const { events } = await createPoolTx.wait();
  const { poolId, stakingPoolAddress } = events[0].args;

  const poolSigner = await ethers.getImpersonatedSigner(stakingPoolAddress);
  await setEtherBalance(stakingPoolAddress, parseEther('1'));

  return {
    ...fixture,
    poolId,
    poolSigner,
  };
}

describe('mintStakingPoolNXMRewards', function () {
  it('reverts if caller is not pool contract', async function () {
    const fixture = await loadFixture(mintStakingPoolNXMRewardsSetup);
    const { tokenController } = fixture.contracts;

    const amount = parseEther('10');
    await expect(tokenController.mintStakingPoolNXMRewards(amount, fixture.poolId)).to.be.revertedWithCustomError(
      tokenController,
      'OnlyStakingPool',
    );
  });

  it('increases staking pool rewards', async function () {
    const fixture = await loadFixture(mintStakingPoolNXMRewardsSetup);
    const { tokenController } = fixture.contracts;

    const initialStakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);

    const amount = parseEther('10');
    await tokenController.connect(fixture.poolSigner).mintStakingPoolNXMRewards(amount, fixture.poolId);

    const stakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);
    expect(stakingPoolNXMBalances.rewards).to.equal(initialStakingPoolNXMBalances.rewards.add(amount));
    expect(stakingPoolNXMBalances.deposits).to.equal(initialStakingPoolNXMBalances.deposits);
  });

  it('mints nxm to the contract', async function () {
    const fixture = await loadFixture(mintStakingPoolNXMRewardsSetup);
    const { tokenController, nxm } = fixture.contracts;

    const initialTcBalance = await nxm.balanceOf(tokenController.address);
    const initialTotalSupply = await nxm.totalSupply();

    const amount = parseEther('10');
    await tokenController.connect(fixture.poolSigner).mintStakingPoolNXMRewards(amount, fixture.poolId);

    const tcBalance = await nxm.balanceOf(tokenController.address);
    const totalSupply = await nxm.totalSupply();

    expect(tcBalance).to.equal(initialTcBalance.add(amount));
    expect(totalSupply).to.equal(initialTotalSupply.add(amount));
  });
});
