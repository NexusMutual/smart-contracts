const { expect } = require('chai');
const { ethers } = require('hardhat');
const { setEtherBalance } = require('../../utils/').evm;
const { stakingPoolAddressAt } = require('../../utils/').addresses;
const { One, MaxUint256 } = ethers.constants;

const poolId = 234;
describe('totalBalanceOf', function () {
  beforeEach(async function () {
    const { nxm } = this.contracts;
    const [member] = this.accounts.members;
    this.nxmBalanceBefore = await nxm.balanceOf(member.address);
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
    const [member] = this.accounts.members;

    // Mint 1
    const amount = One;
    await tokenController.connect(internalContract).mint(member.address, amount);

    const expectedAmount = amount.add(this.nxmBalanceBefore);
    // [balanceOf, totalBalanceOf, totalBalanceOfWithoutDelegations] should all return the same result
    expect(expectedAmount).to.be.eq(await nxm.balanceOf(member.address));
    expect(await tokenController.totalBalanceOf(member.address)).to.equal(expectedAmount);
    expect(await tokenController.totalBalanceOfWithoutDelegations(member.address)).to.equal(expectedAmount);
  });

  it('should correctly calculate staker rewards', async function () {
    const { tokenController, pooledStaking, nxm } = this.contracts;
    const [member] = this.accounts.members;

    // mock staker rewards
    const amount = One;
    await pooledStaking.setStakerReward(member.address, amount);

    const expectedAmount = amount.add(this.nxmBalanceBefore);
    expect(expectedAmount).to.be.gt(await nxm.balanceOf(member.address));
    expect(await tokenController.totalBalanceOf(member.address)).to.equal(expectedAmount);
    expect(await tokenController.totalBalanceOfWithoutDelegations(member.address)).to.equal(expectedAmount);
  });

  it('should correctly calculate staker deposits', async function () {
    const { tokenController, pooledStaking, nxm } = this.contracts;
    const [member] = this.accounts.members;

    // mock staker deposits
    const amount = One;
    await pooledStaking.setStakerDeposit(member.address, amount);

    const expectedAmount = amount.add(this.nxmBalanceBefore);

    expect(expectedAmount).to.be.gt(await nxm.balanceOf(member.address));
    expect(await tokenController.totalBalanceOf(member.address)).to.equal(expectedAmount);
    expect(await tokenController.totalBalanceOfWithoutDelegations(member.address)).to.equal(
      await tokenController.totalBalanceOf(member.address),
    );
  });

  it('should correctly calculate assessment stake', async function () {
    const { assessment, tokenController, nxm } = this.contracts;
    const [member] = this.accounts.members;

    const amount = One.mul(2).pow(80);
    await assessment.setStakeOf(member.address, amount);

    const expectedAmount = amount.add(this.nxmBalanceBefore);

    expect(expectedAmount).to.be.gt(await nxm.balanceOf(member.address));
    expect(await tokenController.totalBalanceOf(member.address)).to.equal(expectedAmount);
    expect(await tokenController.totalBalanceOfWithoutDelegations(member.address)).to.equal(expectedAmount);
  });

  it('should correctly calculate manager delegations', async function () {
    const { tokenController, stakingPoolFactory, nxm } = this.contracts;
    const {
      members: [member],
      internalContracts: [internalContract],
    } = this.accounts;

    const amount = One.mul(2).pow(127); // uint128 overflows

    // Get staking pool at ID and impersonate the address
    const stakingPoolAddress = await stakingPoolAddressAt(stakingPoolFactory.address, poolId);
    const stakingPoolSigner = await ethers.getImpersonatedSigner(stakingPoolAddress);
    await setEtherBalance(stakingPoolAddress, amount);

    // Mint and deposit staked NXM
    await tokenController.connect(internalContract).mint(member.address, amount);
    await nxm.connect(member).approve(tokenController.address, MaxUint256);
    await tokenController.connect(stakingPoolSigner).depositStakedNXM(member.address, amount, poolId);

    // Make manager to get the delegations
    await tokenController.connect(internalContract).assignStakingPoolManager(poolId, member.address);

    const expectedAmount = amount.add(this.nxmBalanceBefore);

    expect(expectedAmount).to.be.gt(await nxm.balanceOf(member.address));
    expect(await tokenController.totalBalanceOf(member.address)).to.equal(expectedAmount);
    expect(await tokenController.totalBalanceOfWithoutDelegations(member.address)).to.equal(
      (await tokenController.totalBalanceOf(member.address)).sub(amount),
    );
  });

  it('should correctly calculate all balances', async function () {
    const { tokenController, stakingPoolFactory, pooledStaking, nxm } = this.contracts;
    const {
      members: [member],
      internalContracts: [internalContract],
    } = this.accounts;

    const delegateAmount = One.mul(2).pow(64); // uint128 overflows

    // setup staking pool signer
    const stakingPoolAddress = await stakingPoolAddressAt(stakingPoolFactory.address, poolId);
    const stakingPoolSigner = await ethers.getImpersonatedSigner(stakingPoolAddress);
    await setEtherBalance(stakingPoolAddress, delegateAmount);

    // set delegation amount
    await tokenController.connect(internalContract).mint(member.address, delegateAmount);
    await nxm.connect(member).approve(tokenController.address, MaxUint256);
    await tokenController.connect(stakingPoolSigner).depositStakedNXM(member.address, delegateAmount, poolId);
    await tokenController.connect(internalContract).assignStakingPoolManager(poolId, member.address);

    // mock legacy deposit amount
    const stakerDepositAmount = delegateAmount.div(2);
    await pooledStaking.setStakerDeposit(member.address, stakerDepositAmount);

    // mock legacy reward amount
    const stakerRewardAmount = delegateAmount.div(2);
    await pooledStaking.setStakerReward(member.address, stakerDepositAmount);

    // minted amount
    const mintedAmount = delegateAmount.div(3);
    await tokenController.connect(internalContract).mint(member.address, mintedAmount);

    expect(await tokenController.totalBalanceOf(member.address)).to.equal(
      delegateAmount.add(stakerDepositAmount).add(stakerRewardAmount).add(mintedAmount).add(this.nxmBalanceBefore),
    );
    expect(await tokenController.totalBalanceOfWithoutDelegations(member.address)).to.equal(
      (await tokenController.totalBalanceOf(member.address)).sub(delegateAmount),
    );
  });

  // TODO: move to fork test
  it.skip('should correctly calculate locked tokens', async function () {});
});
