const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');

describe('CoverBroker - switchMembership', function () {
  it('should switch membership', async function () {
    const fixture = await loadFixture(setup);
    const { cover, mr, coverBroker, p1, tk, tc } = fixture.contracts;
    const newCoverBroker = await ethers.deployContract('CoverBroker', [
      cover.address,
      mr.address,
      p1.address,
      tk.address,
      tc.address,
    ]);

    // Add NXM balance to CoverBroker
    const nxmBalance = ethers.utils.parseEther('10');
    await tk.connect(fixture.accounts.defaultSender).transfer(coverBroker.address, nxmBalance);
    await coverBroker.switchMembership(newCoverBroker.address);

    const check = await mr.isMember(newCoverBroker.address);
    expect(check).to.be.equal(true);
    expect(await tk.balanceOf(newCoverBroker.address)).to.equal(nxmBalance);
  });

  it('should fail to switch membership if the caller is not the owner', async function () {
    const fixture = await loadFixture(setup);
    const { cover, mr, coverBroker, p1, tk, tc } = fixture.contracts;
    const { members } = fixture.accounts;
    const newCoverBroker = await ethers.deployContract('CoverBroker', [
      cover.address,
      mr.address,
      p1.address,
      tk.address,
      tc.address,
    ]);

    await expect(coverBroker.connect(members[0]).switchMembership(newCoverBroker.address)).to.revertedWith(
      'Ownable: caller is not the owner',
    );
  });
});
