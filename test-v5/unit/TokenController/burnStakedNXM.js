const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setEtherBalance } = require('../../utils/evm');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

async function laodBurnStakedNXMFixture() {
  const fixture = await loadFixture(setup);
  const { stakingPoolFactory, tokenController } = fixture.contracts;
  const [member] = fixture.accounts.members;

  const createPoolTx = await stakingPoolFactory.create(AddressZero);
  const { events } = await createPoolTx.wait();
  const { poolId, stakingPoolAddress } = events[0].args;

  const poolSigner = await ethers.getImpersonatedSigner(stakingPoolAddress);
  await setEtherBalance(stakingPoolAddress, parseEther('1'));

  const amount = parseEther('100');
  await tokenController.connect(poolSigner).depositStakedNXM(member.address, amount, poolId);

  return { ...fixture, poolId, poolSigner };
}

describe('burnStakedNXM', function () {
  it('reverts if caller is not pool contract', async function () {
    const fixture = await laodBurnStakedNXMFixture();
    const { tokenController } = fixture.contracts;

    const amount = parseEther('10');
    await expect(tokenController.burnStakedNXM(amount, fixture.poolId)).to.be.revertedWithCustomError(
      tokenController,
      'OnlyStakingPool',
    );
  });

  it('reduces staking pool deposits', async function () {
    const fixture = await laodBurnStakedNXMFixture();
    const { tokenController } = fixture.contracts;

    const initialStakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);

    const amount = parseEther('10');
    await tokenController.connect(fixture.poolSigner).burnStakedNXM(amount, fixture.poolId);

    const stakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);
    expect(stakingPoolNXMBalances.deposits).to.equal(initialStakingPoolNXMBalances.deposits.sub(amount));
    expect(stakingPoolNXMBalances.rewards).to.equal(initialStakingPoolNXMBalances.rewards);
  });

  it('burns nxm from the contract', async function () {
    const fixture = await laodBurnStakedNXMFixture();
    const { tokenController, nxm } = fixture.contracts;

    const initialTcBalance = await nxm.balanceOf(tokenController.address);
    const initialTotalSupply = await nxm.totalSupply();

    const amount = parseEther('10');
    await tokenController.connect(fixture.poolSigner).burnStakedNXM(amount, fixture.poolId);

    const tcBalance = await nxm.balanceOf(tokenController.address);
    const totalSupply = await nxm.totalSupply();

    expect(tcBalance).to.equal(initialTcBalance.sub(amount));
    expect(totalSupply).to.equal(initialTotalSupply.sub(amount));
  });
});
