const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setEtherBalance } = require('../../utils/evm');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

async function loadDepositStakedNXM() {
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

describe('depositStakedNXM', function () {
  it('reverts if caller is not pool contract', async function () {
    const fixture = await loadDepositStakedNXM();
    const { tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const amount = parseEther('10');
    await expect(
      tokenController.depositStakedNXM(member.address, amount, fixture.poolId),
    ).to.be.revertedWithCustomError(tokenController, 'OnlyStakingPool');
  });

  it('increases staking pool deposits', async function () {
    const fixture = await loadDepositStakedNXM();
    const { tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const initialStakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);

    const amount = parseEther('10');
    await tokenController.connect(fixture.poolSigner).depositStakedNXM(member.address, amount, fixture.poolId);

    const stakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(fixture.poolId);
    expect(stakingPoolNXMBalances.deposits).to.equal(initialStakingPoolNXMBalances.deposits.add(amount));
    expect(stakingPoolNXMBalances.rewards).to.equal(initialStakingPoolNXMBalances.rewards);
  });

  it('transfer nxm from the specified account to the contract', async function () {
    const fixture = await loadDepositStakedNXM();
    const { tokenController, nxm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const initialTcBalance = await nxm.balanceOf(tokenController.address);
    const initialUserBalance = await nxm.balanceOf(member.address);

    const amount = parseEther('10');
    await tokenController.connect(fixture.poolSigner).depositStakedNXM(member.address, amount, fixture.poolId);

    const tcBalance = await nxm.balanceOf(tokenController.address);
    const userBalance = await nxm.balanceOf(member.address);

    expect(tcBalance).to.equal(initialTcBalance.add(amount));
    expect(userBalance).to.equal(initialUserBalance.sub(amount));
  });
});
