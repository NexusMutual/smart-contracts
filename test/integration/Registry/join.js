const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');

const { signJoinMessage } = nexus.membership;
const { PauseTypes, ContractIndexes } = nexus.constants;
const { ZeroAddress } = ethers;
const JOINING_FEE = ethers.parseEther('0.002');

describe('join', function () {
  it('should successfully join with real Pool and TokenController integration', async function () {
    const fixture = await loadFixture(setup);
    const { registry, pool, token } = fixture.contracts;
    const { kycAuthSigner } = fixture;
    const [newUser] = fixture.accounts.nonMembers;

    const initialMemberCount = await registry.getMemberCount();
    const initialPoolBalance = await ethers.provider.getBalance(pool.target);
    const initialLastMemberId = await registry.getLastMemberId();

    // before
    expect(await registry.isMember(newUser.address)).to.be.false;
    expect(await registry.getMemberId(newUser.address)).to.equal(0);
    expect(await token.whiteListed(newUser.address)).to.be.false;

    // join
    const signature = await signJoinMessage(kycAuthSigner, newUser.address, registry);
    const joinTx = await registry.connect(newUser).join(newUser.address, signature, { value: JOINING_FEE });

    // after
    const expectedMemberId = initialLastMemberId + 1n;
    expect(await registry.isMember(newUser.address)).to.be.true;
    expect(await registry.getMemberId(newUser.address)).to.equal(expectedMemberId);
    expect(await registry.getMemberAddress(expectedMemberId)).to.equal(newUser.address);
    expect(await registry.getMemberCount()).to.equal(initialMemberCount + 1n);
    expect(await registry.getLastMemberId()).to.equal(expectedMemberId);
    expect(await ethers.provider.getBalance(pool.target)).to.equal(initialPoolBalance + JOINING_FEE);
    expect(await token.whiteListed(newUser.address)).to.be.true;

    await expect(joinTx)
      .to.emit(registry, 'MembershipChanged')
      .withArgs(expectedMemberId, ZeroAddress, newUser.address)
      .to.emit(token, 'WhiteListed')
      .withArgs(newUser.address);
  });

  it('should fail when Pool rejects the joining fee', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const { nonMembers } = fixture.accounts;
    const { kycAuthSigner } = fixture;
    const [newUser] = nonMembers;

    const governorSigner = await ethers.getSigner(governor.target);
    await setBalance(governor.target, ethers.parseEther('10'));

    // replace Pool with EtherRejecter
    const etherRejecter = await ethers.deployContract('EtherRejecterMock');
    await registry.connect(governorSigner).upgradeContract(ContractIndexes.C_POOL, etherRejecter.target);

    // join
    const signature = await signJoinMessage(kycAuthSigner, newUser.address, registry);
    const joinTx = registry.connect(newUser).join(newUser.address, signature, { value: JOINING_FEE });
    await expect(joinTx).to.be.revertedWithCustomError(registry, 'FeeTransferFailed');

    expect(await registry.isMember(newUser.address)).to.be.false;
    expect(await registry.getMemberId(newUser.address)).to.equal(0);
  });

  it('should prevent membership join during global pause', async function () {
    const fixture = await loadFixture(setup);
    const { registry } = fixture.contracts;
    const [newUser] = fixture.accounts.nonMembers;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const { kycAuthSigner } = fixture;

    // set global pause
    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    // join should fail while globally paused
    const signature = await signJoinMessage(kycAuthSigner, newUser.address, registry);
    const joinTx = registry.connect(newUser).join(newUser.address, signature, { value: JOINING_FEE });
    await expect(joinTx)
      .to.be.revertedWithCustomError(registry, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_MEMBERSHIP);
  });
});
