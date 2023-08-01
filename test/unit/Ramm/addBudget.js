const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { parseEther } = ethers.utils;

describe('addBudget', function () {
  it('should revert to update the budget if it is not done by governance', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    const amount = parseEther('250');

    await expect(ramm.connect(member).addBudget(amount)).to.be.revertedWith('Caller is not authorized to govern');
  });

  it('should update the config parameters', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const {
      governanceContracts: [governance],
    } = fixture.accounts;

    const amount = parseEther('250');
    const budgetBefore = await ramm.budget();

    await ramm.connect(governance).addBudget(amount);

    const budgetAfter = await ramm.budget();

    expect(budgetAfter).to.be.equal(budgetBefore.add(amount));
  });
});
