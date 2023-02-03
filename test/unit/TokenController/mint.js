const { expect } = require('chai');
const { parseEther } = require('ethers/lib/utils');

describe('mint', function () {
  it('reverts if caller is not an internal contract', async function () {
    const { tokenController } = this.contracts;
    const [member1] = this.accounts.members;

    const amount = parseEther('10');
    await expect(tokenController.connect(member1).mint(member1.address, amount)).to.be.revertedWith(
      'Caller is not an internal contract',
    );
  });

  it('mint nxm to member', async function () {
    const { tokenController, nxm } = this.contracts;
    const [internalContract] = this.accounts.internalContracts;
    const [member1] = this.accounts.members;

    const initialBalanceMember1 = await nxm.balanceOf(member1.address);

    const amount = parseEther('10');
    await tokenController.connect(internalContract).mint(member1.address, amount);

    const balanceMember1 = await nxm.balanceOf(member1.address);

    expect(balanceMember1).to.equal(initialBalanceMember1.add(amount));
  });
});
