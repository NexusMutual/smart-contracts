const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setEtherBalance } = require('../../utils/evm');

const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

describe('depositStakedNXM', function () {
  beforeEach(async function () {
    const { stakingPoolFactory } = this.contracts;

    const createPoolTx = await stakingPoolFactory.create(AddressZero);
    const { events } = await createPoolTx.wait();
    const { poolId, stakingPoolAddress } = events[0].args;

    this.poolId = poolId;
    this.poolSigner = await ethers.getImpersonatedSigner(stakingPoolAddress);
    await setEtherBalance(stakingPoolAddress, parseEther('1'));
  });

  it('reverts if caller is not pool contract', async function () {
    const { tokenController } = this.contracts;
    const [member] = this.accounts.members;

    const amount = parseEther('10');
    await expect(tokenController.depositStakedNXM(member.address, amount, this.poolId)).to.be.revertedWith(
      'TokenController: Caller not a staking pool',
    );
  });

  it('increases staking pool deposits', async function () {
    const { tokenController } = this.contracts;
    const [member] = this.accounts.members;

    const initialStakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(this.poolId);

    const amount = parseEther('10');
    await tokenController.connect(this.poolSigner).depositStakedNXM(member.address, amount, this.poolId);

    const stakingPoolNXMBalances = await tokenController.stakingPoolNXMBalances(this.poolId);
    expect(stakingPoolNXMBalances.deposits).to.equal(initialStakingPoolNXMBalances.deposits.add(amount));
    expect(stakingPoolNXMBalances.rewards).to.equal(initialStakingPoolNXMBalances.rewards);
  });

  it('transfer nxm from the specified account to the contract', async function () {
    const { tokenController, nxm } = this.contracts;
    const [member] = this.accounts.members;

    const initialTcBalance = await nxm.balanceOf(tokenController.address);
    const initialUserBalance = await nxm.balanceOf(member.address);

    const amount = parseEther('10');
    console.log(this.poolSigner.address);
    console.log(this.poolId);
    await tokenController.connect(this.poolSigner).depositStakedNXM(member.address, amount, this.poolId);

    const tcBalance = await nxm.balanceOf(tokenController.address);
    const userBalance = await nxm.balanceOf(member.address);

    expect(tcBalance).to.equal(initialTcBalance.add(amount));
    expect(userBalance).to.equal(initialUserBalance.sub(amount));
  });
});
