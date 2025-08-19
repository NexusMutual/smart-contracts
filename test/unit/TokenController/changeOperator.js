const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

describe('changeOperator', function () {
  it('reverts if governance is not the caller', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await expect(tokenController.connect(member).changeOperator(member.address)).to.be.revertedWithCustomError(
      tokenController,
      'Unauthorized',
    );
  });

  it('updates operator in the token contract', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, nxm } = fixture.contracts;
    const [governor] = fixture.accounts.governor;
    const [member] = fixture.accounts.members;

    const initialOperator = await nxm.operator();

    const newOperator = member.address;
    await tokenController.connect(governor).changeOperator(member.address);

    const operator = await nxm.operator();

    expect(operator).not.equal(initialOperator);
    expect(operator).equal(newOperator);
  });
});
