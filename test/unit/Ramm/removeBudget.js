const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { impersonateAccount, setEtherBalance } = require('../../utils/evm');

const { parseEther } = ethers.utils;

describe('removeBudget', function () {
  it('should set the budget to 0', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;

    await impersonateAccount(governance.address);
    await setEtherBalance(governance.address, parseEther('1'));
    const governanceSigner = await ethers.provider.getSigner(governance.address);

    const before = await ramm.slot1();
    await ramm.connect(governanceSigner).removeBudget(); // onlyGovernance
    const after = await ramm.slot1();

    expect(before.budget).to.be.not.equal(0);
    expect(after.budget).to.be.equal(0);
  });
});
