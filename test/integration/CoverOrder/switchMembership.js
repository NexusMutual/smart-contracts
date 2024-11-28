const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');

describe('CoverOrder - switchMembership', function () {
  it('should switch membership', async function () {
    const fixture = await loadFixture(setup);
    const { mr, coverOrder, tk, master, weth } = fixture.contracts;
    const { defaultSender } = fixture.accounts;
    const newCoverOrder = await ethers.deployContract('CoverOrder', [
      master.address,
      weth.address,
      defaultSender.address,
    ]);

    // Add NXM balance to CoverOrder
    const nxmBalance = ethers.utils.parseEther('10');
    await tk.connect(fixture.accounts.defaultSender).transfer(coverOrder.address, nxmBalance);
    await coverOrder.switchMembership(newCoverOrder.address);

    const check = await mr.isMember(newCoverOrder.address);
    expect(check).to.be.equal(true);
    expect(await tk.balanceOf(newCoverOrder.address)).to.equal(nxmBalance);
  });

  it('should fail to switch membership if the caller is not the owner', async function () {
    const fixture = await loadFixture(setup);
    const { coverOrder, master, weth } = fixture.contracts;
    const { members, defaultSender } = fixture.accounts;
    const newCoverOrder = await ethers.deployContract('CoverOrder', [
      master.address,
      weth.address,
      defaultSender.address,
    ]);

    await expect(coverOrder.connect(members[0]).switchMembership(newCoverOrder.address)).to.revertedWith(
      'Ownable: caller is not the owner',
    );
  });
});
