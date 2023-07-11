const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

describe('changeOperator', function () {
  it('reverts if governance is not the caller', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await expect(tokenController.connect(member).changeOperator(member.address)).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });

  it('updates operator in the token contract', async function () {
    const fixture = await loadFixture(setup);
    const { tokenController, nxm } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;
    const [member] = fixture.accounts.members;

    const initialOperator = await nxm.operator();

    const newOperator = member.address;
    await tokenController.connect(governance).changeOperator(member.address);

    const operator = await nxm.operator();

    expect(operator).not.equal(initialOperator);
    expect(operator).equal(newOperator);
  });
});
