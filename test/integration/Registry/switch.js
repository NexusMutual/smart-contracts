const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, setBalance, impersonateAccount } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');

describe('switch', function () {
  it('should switchTo with real TokenController integration and NXM token transfer', async function () {
    const fixture = await loadFixture(setup);
    const { registry, tokenController, token } = fixture.contracts;
    const [fromUser] = fixture.accounts.members;
    const [toUser] = fixture.accounts.nonMembers;

    // before
    const memberId = await registry.getMemberId(fromUser.address);
    const nxmBalanceBefore = await token.balanceOf(fromUser.address);

    expect(await registry.isMember(fromUser.address)).to.be.true;
    expect(await registry.isMember(toUser.address)).to.be.false;
    expect(await registry.getMemberAddress(memberId)).to.equal(fromUser.address);
    expect(nxmBalanceBefore).to.be.greaterThan(0n); // fromUser already has NXM tokens
    expect(await token.balanceOf(toUser.address)).to.equal(0n);

    // switch
    await token.connect(fromUser).approve(tokenController.target, nxmBalanceBefore);
    const switchTx = await registry.connect(fromUser).switchTo(toUser.address);

    // after
    expect(await registry.isMember(fromUser.address)).to.be.false;
    expect(await registry.isMember(toUser.address)).to.be.true;
    expect(await registry.getMemberId(fromUser.address)).to.equal(0n);
    expect(await registry.getMemberId(toUser.address)).to.equal(memberId);
    expect(await registry.getMemberAddress(memberId)).to.equal(toUser.address);

    expect(await token.balanceOf(fromUser.address)).to.equal(0n);
    expect(await token.balanceOf(toUser.address)).to.equal(nxmBalanceBefore);

    await expect(switchTx).to.emit(registry, 'MembershipChanged').withArgs(memberId, fromUser.address, toUser.address);
  });

  it('should successfully switchFor with no NXM token transfer', async function () {
    const fixture = await loadFixture(setup);
    const { registry, token, memberRoles } = fixture.contracts;
    const [fromUser] = fixture.accounts.members;
    const [toUser] = fixture.accounts.nonMembers;

    // before
    const memberId = await registry.getMemberId(fromUser.address);
    const nxmBalanceBefore = await token.balanceOf(fromUser.address);
    expect(await registry.isMember(fromUser.address)).to.be.true;
    expect(await registry.isMember(toUser.address)).to.be.false;
    expect(await token.balanceOf(fromUser.address)).to.be.greaterThan(0n);
    expect(await token.balanceOf(toUser.address)).to.equal(0n);

    // switchFor
    await impersonateAccount(memberRoles.target);
    const memberRolesSigner = await ethers.getSigner(memberRoles.target);
    await setBalance(memberRoles.target, ethers.parseEther('1'));

    const switchTx = await registry.connect(memberRolesSigner).switchFor(fromUser.address, toUser.address);

    // after
    expect(await registry.isMember(fromUser.address)).to.be.false;
    expect(await registry.isMember(toUser.address)).to.be.true;
    expect(await registry.getMemberId(fromUser.address)).to.equal(0n);
    expect(await registry.getMemberId(toUser.address)).to.equal(memberId);
    expect(await registry.getMemberAddress(memberId)).to.equal(toUser.address);

    // should not transfer NXM
    expect(await token.balanceOf(fromUser.address)).to.equal(nxmBalanceBefore);
    expect(await token.balanceOf(toUser.address)).to.equal(0n);

    await expect(switchTx).to.emit(registry, 'MembershipChanged').withArgs(memberId, fromUser.address, toUser.address);
  });
});
