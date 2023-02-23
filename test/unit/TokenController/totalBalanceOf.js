const { expect } = require('chai');
const { ethers } = require('hardhat');
const { setEtherBalance } = require('../../utils/evm');
const { One, MaxUint256 } = ethers.constants;

const poolId = 234;
describe('totalBalanceOf', function () {
  beforeEach(async function () {
    const { nxm } = this.contracts;
    const [member1] = this.accounts.members;
    this.nxmBalanceBefore = await nxm.balanceOf(member1.address);
  });

  it('should return 0 if address has no balance', async function () {
    const { tokenController } = this.contracts;
    const [nonMember1] = this.accounts.nonMembers;

    expect(await tokenController.totalBalanceOf(nonMember1.address)).to.equal(0);
    expect(await tokenController.totalBalanceOfWithoutDelegations(nonMember1.address)).to.equal(0);
  });

  it('should correctly calculate simple balance', async function () {
    const { tokenController, nxm } = this.contracts;
    const [internalContract] = this.accounts.internalContracts;
    const [member1] = this.accounts.members;

    // Mint 1
    const amount = One;
    await tokenController.connect(internalContract).mint(member1.address, amount);

    // [balanceOf, totalBalanceOf, totalBalanceOfWithoutDelegations] should all return the same result
    expect(await tokenController.totalBalanceOf(member1.address)).to.equal(amount.add(this.nxmBalanceBefore));
    expect(await tokenController.totalBalanceOfWithoutDelegations(member1.address)).to.equal(
      await nxm.balanceOf(member1.address),
    );
  });

  it('should correctly calculate staker rewards', async function () {
    const { tokenController, pooledStaking, nxm } = this.contracts;
    const [member1] = this.accounts.members;

    // mock staker rewards
    const amount = One;
    await pooledStaking.setStakerReward(member1.address, amount);

    expect(await tokenController.totalBalanceOf(member1.address)).to.equal(amount.add(this.nxmBalanceBefore));
    expect(await tokenController.totalBalanceOfWithoutDelegations(member1.address)).to.equal(
      amount.add(await nxm.balanceOf(member1.address)),
    );
  });

  it('should correctly calculate staker deposits', async function () {
    const { tokenController, pooledStaking } = this.contracts;
    const [member1] = this.accounts.members;

    // mock staker deposits
    const amount = One;
    await pooledStaking.setStakerDeposit(member1.address, amount);

    expect(await tokenController.totalBalanceOf(member1.address)).to.equal(amount.add(this.nxmBalanceBefore));
    expect(await tokenController.totalBalanceOfWithoutDelegations(member1.address)).to.equal(
      await tokenController.totalBalanceOf(member1.address),
    );
  });

  it('should correctly calculate assessment stake', async function () {
    const { assessment, tokenController } = this.contracts;
    const [member1] = this.accounts.members;

    const amount = One.mul(2).pow(80);
    await assessment.setStakeOf(member1.address, amount);

    expect(await tokenController.totalBalanceOf(member1.address)).to.equal(amount.add(this.nxmBalanceBefore));
    expect(await tokenController.totalBalanceOfWithoutDelegations(member1.address)).to.equal(
      await tokenController.totalBalanceOf(member1.address),
    );
  });

  async function stakingPoolAddressAt(poolFactoryAddress, poolId) {
    const initCodeHash = '203b477dc328f1ceb7187b20e5b1b0f0bc871114ada7e9020c9ac112bbfb6920';
    const salt = Buffer.from(poolId.toString(16).padStart(64, '0'), 'hex');
    const initCodeHashHex = Buffer.from(initCodeHash, 'hex');
    const stakingPoolAddress = ethers.utils.getCreate2Address(poolFactoryAddress, salt, initCodeHashHex);
    return stakingPoolAddress;
  }

  it('should correctly calculate manager delegations', async function () {
    const { tokenController, stakingPoolFactory, nxm } = this.contracts;
    const {
      members: [member1],
      internalContracts: [internalContract],
    } = this.accounts;

    const amount = One.mul(2).pow(127); // uint128 overflows

    // Get staking pool at ID and impersonate the address
    const stakingPoolAddress = await stakingPoolAddressAt(stakingPoolFactory.address, poolId);
    const stakingPoolSigner = await ethers.getImpersonatedSigner(stakingPoolAddress);
    await setEtherBalance(stakingPoolAddress, amount);

    // Mint and deposit staked NXM
    await tokenController.connect(internalContract).mint(member1.address, amount);
    await nxm.connect(member1).approve(tokenController.address, MaxUint256);
    await tokenController.connect(stakingPoolSigner).depositStakedNXM(member1.address, amount, poolId);

    // Make manager to get the delegations
    await tokenController.connect(internalContract).assignStakingPoolManager(poolId, member1.address);

    expect(await tokenController.totalBalanceOf(member1.address)).to.equal(amount.add(this.nxmBalanceBefore));
    expect(await tokenController.totalBalanceOfWithoutDelegations(member1.address)).to.equal(
      (await tokenController.totalBalanceOf(member1.address)).sub(amount),
    );
  });

  it('should correctly calculate all balances', async function () {
    const { tokenController, stakingPoolFactory, pooledStaking, nxm } = this.contracts;
    const {
      members: [member1],
      internalContracts: [internalContract],
    } = this.accounts;

    // setup delegation amount
    const delegateAmount = One.mul(2).pow(64); // uint128 overflows
    const stakingPoolAddress = await stakingPoolAddressAt(stakingPoolFactory.address, poolId);
    const stakingPoolSigner = await ethers.getImpersonatedSigner(stakingPoolAddress);
    await setEtherBalance(stakingPoolAddress, delegateAmount);
    await tokenController.connect(internalContract).mint(member1.address, delegateAmount);
    await nxm.connect(member1).approve(tokenController.address, MaxUint256);
    await tokenController.connect(stakingPoolSigner).depositStakedNXM(member1.address, delegateAmount, poolId);
    await tokenController.connect(internalContract).assignStakingPoolManager(poolId, member1.address);

    // legacy deposit amount
    const stakerDepositAmount = delegateAmount.div(2);
    await pooledStaking.setStakerDeposit(member1.address, stakerDepositAmount);

    // legacy reward amount
    const stakerRewardAmount = delegateAmount.div(2);
    await pooledStaking.setStakerReward(member1.address, stakerDepositAmount);

    // minted amount
    const mintedAmount = delegateAmount.div(3);
    await tokenController.connect(internalContract).mint(member1.address, mintedAmount);

    expect(await tokenController.totalBalanceOf(member1.address)).to.equal(
      delegateAmount.add(stakerDepositAmount).add(stakerRewardAmount).add(mintedAmount).add(this.nxmBalanceBefore),
    );
    expect(await tokenController.totalBalanceOfWithoutDelegations(member1.address)).to.equal(
      (await tokenController.totalBalanceOf(member1.address)).sub(delegateAmount),
    );
  });

  it.skip('should correctly calculate locked tokens', async function () {
    // TODO: how to lock tokens?
  });
});
