const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

describe('removeBudget', function () {
  it('should set the budget to 0', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;

    const before = await ramm.slot1();
    await ramm.connect(governance).removeBudget();
    const after = await ramm.slot1();

    expect(before.budget).to.be.gt(0n);
    expect(after.budget).to.be.equal(0n);
  });

  it('should emit event BudgetRemoved', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;

    await expect(ramm.connect(governance).removeBudget()).to.emit(ramm, 'BudgetRemoved');
  });
});
