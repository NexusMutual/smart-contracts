const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');

describe('CoverBroker - switchMembership', function () {
  it('should switch membership to new CoverBroker contract', async function () {
    const fixture = await loadFixture(setup);
    const { registry, coverBroker, tokenController, token } = fixture.contracts;
    const owner = fixture.accounts.defaultSender;

    // new CoverBroker
    const newCoverBroker = await ethers.deployContract('CoverBroker', [registry.target, owner.address]);
    expect(await registry.isMember(newCoverBroker.target)).to.be.equal(false);
    expect(await token.balanceOf(newCoverBroker.target)).to.equal(0n);

    // add NXM balance to CoverBroker
    const nxmBalance = ethers.parseEther('10');
    const tokenControllerSigner = await ethers.getSigner(tokenController.target);
    await setBalance(tokenController.target, ethers.parseEther('10'));
    await token.connect(tokenControllerSigner).mint(coverBroker.target, nxmBalance);

    // switch
    await coverBroker.connect(owner).switchMembership(newCoverBroker.target);

    expect(await registry.isMember(coverBroker.target)).to.be.equal(false);
    expect(await registry.isMember(newCoverBroker.target)).to.be.equal(true);
    expect(await token.balanceOf(newCoverBroker.target)).to.equal(nxmBalance);
  });

  it('should fail to switch membership if the caller is not the owner', async function () {
    const fixture = await loadFixture(setup);
    const { registry, coverBroker } = fixture.contracts;
    const { members, defaultSender } = fixture.accounts;
    const newCoverBroker = await ethers.deployContract('CoverBroker', [registry.target, defaultSender.address]);

    const [nonOwner] = members;
    const switchMembershipTx = coverBroker.connect(nonOwner).switchMembership(newCoverBroker.target);

    await expect(switchMembershipTx).to.revertedWith('Ownable: caller is not the owner');
  });
});
