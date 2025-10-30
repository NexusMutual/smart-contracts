const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

describe('removeBudget', function () {
  it('should set the budget to 0', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;

    const before = await ramm.slot1();
    const governanceSigner = await ethers.provider.getSigner(governance.address);
    await ramm.connect(governanceSigner).removeBudget(); // onlyGovernance
    const after = await ramm.slot1();

    expect(before.budget).to.be.not.equal(0);
    expect(after.budget).to.be.equal(0);
  });

  it('should emit event BudgetRemoved', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;

    const governanceSigner = await ethers.provider.getSigner(governance.address);

    await expect(ramm.connect(governanceSigner).removeBudget()).to.emit(ramm, 'BudgetRemoved');
  });
});
