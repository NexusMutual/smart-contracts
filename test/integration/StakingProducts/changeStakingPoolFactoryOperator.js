const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { getFundedSigner } = require('../utils');

describe('changeStakingPoolFactoryOperator', function () {
  it('should change Staking Pool Factory operator', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts, stakingPoolFactory, governor } = fixture.contracts;

    // Impersonate governor contract
    const governanceSigner = await getFundedSigner(governor.target, ethers.parseEther('1000'));
    const operator = ethers.Wallet.createRandom();

    const stakingPoolFactoryOperatorBefore = await stakingPoolFactory.operator();

    await stakingProducts.connect(governanceSigner).changeStakingPoolFactoryOperator(operator.address);

    const stakingPoolFactoryOperatorAfter = await stakingPoolFactory.operator();

    expect(stakingPoolFactoryOperatorAfter).to.not.be.equal(stakingPoolFactoryOperatorBefore);
    expect(stakingPoolFactoryOperatorAfter).to.equal(operator.address);
  });

  it('should fail to change Staking Pool Factory operator if the caller is not internal', async function () {
    const fixture = await loadFixture(setup);
    const { stakingProducts, registry } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const operator = ethers.Wallet.createRandom();

    const nonInternalContractCall = stakingProducts.connect(member).changeStakingPoolFactoryOperator(operator.address);
    await expect(nonInternalContractCall).to.be.revertedWithCustomError(registry, 'ContractDoesNotExist');
  });
});
