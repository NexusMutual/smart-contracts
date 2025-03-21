const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const { setEtherBalance } = require('../../utils/').evm;
const { stakingPoolAddressAt } = require('../../utils/').addresses;
const { Two, MaxUint256 } = ethers.constants;

const poolId = 234;

async function totalBalanceOfSetup() {
  const fixture = await loadFixture(setup);
  const { nxm } = fixture.contracts;
  const [member] = fixture.accounts.members;
  const nxmBalanceBefore = await nxm.balanceOf(member.address);
  return {
    ...fixture,
    nxmBalanceBefore,
  };
}

describe('totalBalanceOf', function () {
  it('should return 0 if address has no balance', async function () {
    const fixture = await loadFixture(totalBalanceOfSetup);
    const { tokenController } = fixture.contracts;
    const [nonMember1] = fixture.accounts.nonMembers;

    expect(await tokenController.totalBalanceOf(nonMember1.address)).to.equal(0);
    expect(await tokenController.totalBalanceOfWithoutDelegations(nonMember1.address)).to.equal(0);
  });

  it('should correctly calculate simple balance', async function () {
    const fixture = await loadFixture(totalBalanceOfSetup);
    const { tokenController, nxm } = fixture.contracts;
    const [internalContract] = fixture.accounts.internalContracts;
    const [member] = fixture.accounts.members;

    // Mint 1
    const amount = Two;
    await tokenController.connect(internalContract).mint(member.address, amount);

    const expectedAmount = amount.add(fixture.nxmBalanceBefore);
    // [balanceOf, totalBalanceOf, totalBalanceOfWithoutDelegations] should all return the same result
    expect(expectedAmount).to.be.eq(await nxm.balanceOf(member.address));
    expect(await tokenController.totalBalanceOf(member.address)).to.equal(expectedAmount);
    expect(await tokenController.totalBalanceOfWithoutDelegations(member.address)).to.equal(expectedAmount);
  });

  it('should correctly calculate assessment stake', async function () {
    const fixture = await loadFixture(totalBalanceOfSetup);
    const { assessment, tokenController, nxm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const amount = Two.pow(80);
    await assessment.setStakeOf(member.address, amount);

    const expectedAmount = amount.add(fixture.nxmBalanceBefore);

    expect(expectedAmount).to.be.gt(await nxm.balanceOf(member.address));
    expect(await tokenController.totalBalanceOf(member.address)).to.equal(expectedAmount);
    expect(await tokenController.totalBalanceOfWithoutDelegations(member.address)).to.equal(expectedAmount);
  });

  it('should correctly calculate manager delegations', async function () {
    const fixture = await loadFixture(totalBalanceOfSetup);
    const { tokenController, stakingPoolFactory, nxm } = fixture.contracts;
    const {
      members: [member],
      internalContracts: [internalContract],
    } = fixture.accounts;

    const amount = Two.pow(127); // uint128 overflows

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

    const expectedAmount = amount.add(fixture.nxmBalanceBefore);

    expect(expectedAmount).to.be.gt(await nxm.balanceOf(member.address));
    expect(await tokenController.totalBalanceOf(member.address)).to.equal(expectedAmount);
    expect(await tokenController.totalBalanceOfWithoutDelegations(member.address)).to.equal(
      (await tokenController.totalBalanceOf(member.address)).sub(amount),
    );
  });

  it('should correctly calculate all balances', async function () {
    const fixture = await loadFixture(totalBalanceOfSetup);
    const { tokenController, stakingPoolFactory, nxm } = fixture.contracts;
    const {
      members: [member],
      internalContracts: [internalContract],
    } = fixture.accounts;

    const delegateAmount = Two.pow(64); // uint128 overflows

    // setup staking pool signer
    const stakingPoolAddress = await stakingPoolAddressAt(stakingPoolFactory.address, poolId);
    const stakingPoolSigner = await ethers.getImpersonatedSigner(stakingPoolAddress);
    await setEtherBalance(stakingPoolAddress, delegateAmount);

    // set delegation amount
    await tokenController.connect(stakingPoolSigner);
    await tokenController.connect(internalContract).mint(member.address, delegateAmount);
    await nxm.connect(member).approve(tokenController.address, MaxUint256);
    await tokenController.connect(stakingPoolSigner).depositStakedNXM(member.address, delegateAmount, poolId);
    await tokenController.connect(internalContract).assignStakingPoolManager(poolId, member.address);

    // minted amount
    const mintedAmount = delegateAmount.div(3);
    await tokenController.connect(internalContract).mint(member.address, mintedAmount);

    expect(await tokenController.totalBalanceOf(member.address)).to.equal(
      delegateAmount.add(mintedAmount).add(fixture.nxmBalanceBefore),
    );
    expect(await tokenController.totalBalanceOfWithoutDelegations(member.address)).to.equal(
      (await tokenController.totalBalanceOf(member.address)).sub(delegateAmount),
    );
  });
});
