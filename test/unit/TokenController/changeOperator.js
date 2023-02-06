const { expect } = require('chai');

describe('changeOperator', function () {
  it('reverts if governance is not the caller', async function () {
    const { tokenController } = this.contracts;
    const [member] = this.accounts.members;

    await expect(tokenController.connect(member).changeOperator(member.address)).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });

  it('updates operator in the token contract', async function () {
    const { tokenController, nxm } = this.contracts;
    const [governance] = this.accounts.governanceContracts;
    const [member] = this.accounts.members;

    const initialOperator = await nxm.operator();

    const newOperator = member.address;
    await tokenController.connect(governance).changeOperator(member.address);

    const operator = await nxm.operator();

    expect(operator).not.equal(initialOperator);
    expect(operator).equal(newOperator);
  });
});
