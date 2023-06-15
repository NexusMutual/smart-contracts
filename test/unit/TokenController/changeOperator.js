const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');
const setup = require('./setup');

describe('changeOperator', function () {
  let fixture;
  beforeEach(async function () {
    fixture = await loadFixture(setup);
  });

  it('reverts if governance is not the caller', async function () {
    const { tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await expect(tokenController.connect(member).changeOperator(member.address)).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });

  it('updates operator in the token contract', async function () {
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
