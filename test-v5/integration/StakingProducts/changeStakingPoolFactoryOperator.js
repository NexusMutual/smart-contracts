const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { getGovernanceSigner } = require('../utils/enroll');

describe('changeStakingPoolFactoryOperator', function () {
  it('should change Staking Pool Factory operator', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts, spf, gv } = fixture.contracts;
    const governanceSigner = await getGovernanceSigner(gv);
    const operator = ethers.Wallet.createRandom();

    const stakingPoolFactoryOperatorBefore = await spf.operator();

    await stakingProducts.connect(governanceSigner).changeStakingPoolFactoryOperator(operator.address);

    const stakingPoolFactoryOperatorAfter = await spf.operator();

    expect(stakingPoolFactoryOperatorAfter).to.not.be.equal(stakingPoolFactoryOperatorBefore);
    expect(stakingPoolFactoryOperatorAfter).to.equal(operator.address);
  });

  it('should fail to change Staking Pool Factory operator if the caller is not internal', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;
    const operator = ethers.Wallet.createRandom();

    await expect(stakingProducts.connect(member).changeStakingPoolFactoryOperator(operator.address)).to.be.revertedWith(
      'Caller is not an internal contract',
    );
  });
});
