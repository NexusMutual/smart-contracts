const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture, setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const { calculateStakingPoolAddress } = require('../../utils/calculateStakingPoolAddress');

const { MaxUint256 } = ethers;

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
    const [ramm] = fixture.accounts.ramm;
    const [member] = fixture.accounts.members;

    // Mint 1
    const amount = 2n;
    await tokenController.connect(ramm).mint(member.address, amount);

    const expectedAmount = amount + fixture.nxmBalanceBefore;
    // [balanceOf, totalBalanceOf, totalBalanceOfWithoutDelegations] should all return the same result
    expect(expectedAmount).to.be.eq(await nxm.balanceOf(member.address));
    expect(await tokenController.totalBalanceOf(member.address)).to.equal(expectedAmount);
    expect(await tokenController.totalBalanceOfWithoutDelegations(member.address)).to.equal(expectedAmount);
  });

  it('should correctly calculate manager delegations', async function () {
    const fixture = await loadFixture(totalBalanceOfSetup);
    const { tokenController, stakingPoolFactory, nxm } = fixture.contracts;
    const {
      members: [member],
      ramm: [ramm],
      stakingProducts: [stakingProducts],
    } = fixture.accounts;

    const amount = 2n ** 127n; // uint128 overflows

    // Get staking pool at ID and impersonate the address
    const stakingPoolAddress = await calculateStakingPoolAddress(stakingPoolFactory.target, poolId);
    const stakingPoolSigner = await ethers.getImpersonatedSigner(stakingPoolAddress);
    await setBalance(stakingPoolAddress, amount);

    // Mint and deposit staked NXM
    await tokenController.connect(ramm).mint(member.address, amount);
    await nxm.connect(member).approve(tokenController.target, MaxUint256);
    await tokenController.connect(stakingPoolSigner).depositStakedNXM(member.address, amount, poolId);

    // Make manager to get the delegations
    await tokenController.connect(stakingProducts).assignStakingPoolManager(poolId, member.address);

    const expectedAmount = amount + fixture.nxmBalanceBefore;

    expect(expectedAmount).to.be.gt(await nxm.balanceOf(member.address));
    expect(await tokenController.totalBalanceOf(member.address)).to.equal(expectedAmount);
    expect(await tokenController.totalBalanceOfWithoutDelegations(member.address)).to.equal(
      (await tokenController.totalBalanceOf(member.address)) - amount,
    );
  });

  it('should correctly calculate all balances', async function () {
    const fixture = await loadFixture(totalBalanceOfSetup);
    const { tokenController, stakingPoolFactory, nxm } = fixture.contracts;
    const {
      members: [member],
      ramm: [ramm],
      stakingProducts: [stakingProducts],
    } = fixture.accounts;

    const delegateAmount = 2n ** 64n; // uint128 overflows

    // setup staking pool signer
    const stakingPoolAddress = await calculateStakingPoolAddress(stakingPoolFactory.target, poolId);
    const stakingPoolSigner = await ethers.getImpersonatedSigner(stakingPoolAddress);
    await setBalance(stakingPoolAddress, delegateAmount);

    // set delegation amount
    await tokenController.connect(stakingPoolSigner);
    await tokenController.connect(ramm).mint(member.address, delegateAmount);
    await nxm.connect(member).approve(tokenController, MaxUint256);
    await tokenController.connect(stakingPoolSigner).depositStakedNXM(member.address, delegateAmount, poolId);
    await tokenController.connect(stakingProducts).assignStakingPoolManager(poolId, member.address);

    // minted amount
    const mintedAmount = delegateAmount / 3n;
    await tokenController.connect(ramm).mint(member.address, mintedAmount);

    expect(await tokenController.totalBalanceOf(member.address)).to.equal(
      delegateAmount + mintedAmount + fixture.nxmBalanceBefore,
    );
    expect(await tokenController.totalBalanceOfWithoutDelegations(member.address)).to.equal(
      (await tokenController.totalBalanceOf(member.address)) - delegateAmount,
    );
  });
});
