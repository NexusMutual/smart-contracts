const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, impersonateAccount, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');

const { PauseTypes, Assets, SwapKind, ContractIndexes } = nexus.constants;
const { signJoinMessage } = nexus.signing;

describe('Global Pause', function () {
  it('should revert when not called by emergency admin', async function () {
    const fixture = await loadFixture(setup);
    const { registry } = fixture.contracts;
    const [unknown] = fixture.accounts.nonMembers;

    const proprosePause = registry.connect(unknown).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await expect(proprosePause).to.be.revertedWithCustomError(registry, 'OnlyEmergencyAdmin');
  });

  it('should be able to start and end emergency pause', async function () {
    const fixture = await loadFixture(setup);
    const { registry } = fixture.contracts;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const [, member] = fixture.accounts.members;

    expect(await registry.getPauseConfig()).to.equal(0);
    expect(await registry.isMember(member.address)).to.be.true;

    // start emergency pause
    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    expect(await registry.getPauseConfig()).to.equal(PauseTypes.PAUSE_GLOBAL);

    // leave fail
    await expect(registry.connect(member).leave())
      .to.be.revertedWithCustomError(registry, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_MEMBERSHIP);

    expect(await registry.isMember(member.address)).to.be.true;

    // end emergency pause
    await registry.connect(ea1).proposePauseConfig(0);
    await registry.connect(ea2).confirmPauseConfig(0);

    expect(await registry.getPauseConfig()).to.equal(0);

    // leave success
    await registry.connect(member).leave();
    expect(await registry.isMember(member.address)).to.be.false;
  });

  it('should be able to perform contract upgrades during emergency pause', async function () {
    const fixture = await loadFixture(setup);
    const { registry, governor } = fixture.contracts;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;

    // start emergency pause
    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    // upgrade
    const newImplementation = await ethers.deployContract('Pool', [registry]);
    await impersonateAccount(governor.target);
    const governorSigner = await ethers.getSigner(governor.target);
    await setBalance(governor.target, ethers.parseEther('1'));
    await registry.connect(governorSigner).upgradeContract(ContractIndexes.C_POOL, newImplementation.target);

    // proxy should have new implementation
    const contractAddress = await registry.getContractAddressByIndex(ContractIndexes.C_POOL);
    const proxy = await ethers.getContractAt('UpgradeableProxy', contractAddress);
    expect(await proxy.implementation()).to.equal(newImplementation.target);
  });

  it('stops cover purchases', async function () {
    const fixture = await loadFixture(setup);
    const { registry, cover } = fixture.contracts;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const [member] = fixture.accounts.members;

    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    const buyCoverTx = cover.connect(member).buyCover(
      {
        owner: member.address,
        coverId: 0,
        productId: 0,
        coverAsset: 0,
        amount: ethers.parseEther('1'),
        period: 3600 * 24 * 30,
        maxPremiumInAsset: ethers.parseEther('0.1'),
        paymentAsset: 0,
        commissionRatio: 0,
        commissionDestination: ethers.ZeroAddress,
        ipfsData: '',
      },
      [{ poolId: 1, coverAmountInAsset: ethers.parseEther('1') }],
      { value: ethers.parseEther('0.1') },
    );
    await expect(buyCoverTx).to.be.revertedWithCustomError(registry, 'Paused').withArgs(1, 64);
  });

  it('stops claim payouts on redeemPayout', async function () {
    const fixture = await loadFixture(setup);
    const { registry, claims } = fixture.contracts;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const [member] = fixture.accounts.members;

    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    await expect(claims.connect(member).redeemClaimPayout(1))
      .to.be.revertedWithCustomError(claims, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_CLAIMS);
  });

  it('stops claim voting', async function () {
    const fixture = await loadFixture(setup);
    const { registry, assessments } = fixture.contracts;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const [member] = fixture.accounts.members;

    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    await expect(assessments.connect(member).castVote(1, true, ethers.ZeroHash))
      .to.be.revertedWithCustomError(assessments, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_ASSESSMENTS);
  });

  it('should prevent Registry functions when PAUSE_GLOBAL is active', async function () {
    const fixture = await loadFixture(setup);
    const { registry } = fixture.contracts;
    const [newUser] = fixture.accounts.nonMembers;
    const [, member] = fixture.accounts.members;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const { kycAuthSigner } = fixture;
    const JOINING_FEE = ethers.parseEther('0.002');

    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    // prevent join
    expect(await registry.isMember(newUser.address)).to.be.false;

    const signature = await signJoinMessage(kycAuthSigner, newUser.address, registry);
    const joinTx = registry.connect(newUser).join(newUser.address, signature, { value: JOINING_FEE });
    await expect(joinTx)
      .to.be.revertedWithCustomError(registry, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_MEMBERSHIP);

    expect(await registry.isMember(newUser.address)).to.be.false;

    // prevent leave
    expect(await registry.isMember(member.address)).to.be.true;

    await expect(registry.connect(member).leave())
      .to.be.revertedWithCustomError(registry, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_MEMBERSHIP);

    expect(await registry.isMember(member.address)).to.be.true;
  });

  it('should prevent TokenController withdrawNXM when PAUSE_GLOBAL is active', async function () {
    const fixture = await loadFixture(setup);
    const { registry, tokenController } = fixture.contracts;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const [user] = fixture.accounts.members;

    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    await expect(tokenController.connect(user).withdrawNXM([], []))
      .to.be.revertedWithCustomError(tokenController, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_GLOBAL);
  });

  it('should prevent Pool updateMCR when PAUSE_GLOBAL is active', async function () {
    const fixture = await loadFixture(setup);
    const { registry, pool } = fixture.contracts;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;

    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    await expect(pool.updateMCR())
      .to.be.revertedWithCustomError(pool, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_GLOBAL);
  });

  it('should prevent Claims functions when PAUSE_GLOBAL is active', async function () {
    const fixture = await loadFixture(setup);
    const { registry, claims } = fixture.contracts;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const [user] = fixture.accounts.members;

    // Set global pause via emergency admin flow
    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    // All Claims functions should fail with global pause
    await expect(claims.connect(user).submitClaim(1, 1000, ethers.ZeroHash, { value: ethers.parseEther('0.01') }))
      .to.be.revertedWithCustomError(claims, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_CLAIMS);

    await expect(claims.connect(user).redeemClaimPayout(1))
      .to.be.revertedWithCustomError(claims, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_CLAIMS);

    await expect(claims.connect(user).retrieveDeposit(1))
      .to.be.revertedWithCustomError(claims, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_CLAIMS);
  });

  it('should prevent RAMM functions when PAUSE_GLOBAL is active', async function () {
    const fixture = await loadFixture(setup);
    const { registry, ramm } = fixture.contracts;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const [user] = fixture.accounts.members;

    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    const deadline = Math.floor(Date.now() / 1000) + 3600;

    await expect(ramm.connect(user).swap(0, 0, deadline, { value: ethers.parseEther('1') }))
      .to.be.revertedWithCustomError(ramm, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_RAMM);

    await expect(ramm.updateTwap())
      .to.be.revertedWithCustomError(ramm, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_RAMM);

    await expect(ramm.getInternalPriceAndUpdateTwap())
      .to.be.revertedWithCustomError(ramm, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_RAMM);
  });

  it('should prevent SwapOperator functions when PAUSE_GLOBAL is active', async function () {
    const fixture = await loadFixture(setup);
    const { registry, swapOperator, dai, governor } = fixture.contracts;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const { impersonateAccount, setBalance } = require('@nomicfoundation/hardhat-network-helpers');
    const timestamp = Math.floor(Date.now() / 1000);

    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    await impersonateAccount(governor.target);
    const governorSigner = await ethers.getSigner(governor.target);
    await setBalance(governor.target, ethers.parseEther('1'));

    // requestAssetSwap should fail
    const requestAssetSwapTx = swapOperator.connect(governorSigner).requestAssetSwap({
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: ethers.parseEther('1'),
      toAmount: ethers.parseEther('2000'),
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    });

    await expect(requestAssetSwapTx)
      .to.be.revertedWithCustomError(swapOperator, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_SWAPS);
  });

  it('should prevent Assessments functions when PAUSE_GLOBAL is active', async function () {
    const fixture = await loadFixture(setup);
    const { registry, assessments } = fixture.contracts;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const [user] = fixture.accounts.members;

    // Set global pause via emergency admin flow
    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_GLOBAL);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    // castVote should fail with global pause
    await expect(assessments.connect(user).castVote(1, true, ethers.ZeroHash))
      .to.be.revertedWithCustomError(assessments, 'Paused')
      .withArgs(PauseTypes.PAUSE_GLOBAL, PauseTypes.PAUSE_ASSESSMENTS);
  });
});

describe('Specific Pause Types', function () {
  it('should prevent Registry join when PAUSE_MEMBERSHIP is active', async function () {
    const fixture = await loadFixture(setup);
    const { registry } = fixture.contracts;
    const [newUser] = fixture.accounts.nonMembers;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const { kycAuthSigner } = fixture;

    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_MEMBERSHIP);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_MEMBERSHIP);

    // join should fail while on membership pause
    const signature = await signJoinMessage(kycAuthSigner, newUser.address, registry);
    const joinTx = registry.connect(newUser).join(newUser.address, signature, { value: ethers.parseEther('0.002') });

    await expect(joinTx)
      .to.be.revertedWithCustomError(registry, 'Paused')
      .withArgs(PauseTypes.PAUSE_MEMBERSHIP, PauseTypes.PAUSE_MEMBERSHIP);

    expect(await registry.isMember(newUser.address)).to.be.false;
  });

  it('should prevent Registry leave when PAUSE_MEMBERSHIP is active', async function () {
    const fixture = await loadFixture(setup);
    const { registry } = fixture.contracts;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const [, member] = fixture.accounts.members;

    expect(await registry.isMember(member.address)).to.be.true;

    // Set membership pause via emergency admin flow
    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_MEMBERSHIP);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_MEMBERSHIP);

    // leave should fail
    await expect(registry.connect(member).leave())
      .to.be.revertedWithCustomError(registry, 'Paused')
      .withArgs(PauseTypes.PAUSE_MEMBERSHIP, PauseTypes.PAUSE_MEMBERSHIP);

    expect(await registry.isMember(member.address)).to.be.true;
  });

  it('should prevent Registry switchTo when PAUSE_MEMBERSHIP is active', async function () {
    const fixture = await loadFixture(setup);
    const { registry } = fixture.contracts;
    const [fromUser] = fixture.accounts.members;
    const [toUser] = fixture.accounts.nonMembers;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;

    expect(await registry.isMember(fromUser.address)).to.be.true;

    // Set membership pause via emergency admin flow
    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_MEMBERSHIP);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_MEMBERSHIP);

    // switchTo should fail
    await expect(registry.connect(fromUser).switchTo(toUser.address))
      .to.be.revertedWithCustomError(registry, 'Paused')
      .withArgs(PauseTypes.PAUSE_MEMBERSHIP, PauseTypes.PAUSE_MEMBERSHIP);

    expect(await registry.isMember(fromUser.address)).to.be.true;
    expect(await registry.isMember(toUser.address)).to.be.false;
  });

  it('should prevent Registry switchFor when PAUSE_MEMBERSHIP is active', async function () {
    const fixture = await loadFixture(setup);
    const { registry, memberRoles } = fixture.contracts;
    const [fromUser] = fixture.accounts.members;
    const [toUser] = fixture.accounts.nonMembers;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const { impersonateAccount, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

    expect(await registry.isMember(fromUser.address)).to.be.true;

    // Set membership pause via emergency admin flow
    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_MEMBERSHIP);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_MEMBERSHIP);

    // switchFor should fail
    await impersonateAccount(memberRoles.target);
    const memberRolesSigner = await ethers.getSigner(memberRoles.target);
    await setBalance(memberRoles.target, ethers.parseEther('1'));

    await expect(registry.connect(memberRolesSigner).switchFor(fromUser.address, toUser.address))
      .to.be.revertedWithCustomError(registry, 'Paused')
      .withArgs(PauseTypes.PAUSE_MEMBERSHIP, PauseTypes.PAUSE_MEMBERSHIP);

    expect(await registry.isMember(fromUser.address)).to.be.true;
    expect(await registry.isMember(toUser.address)).to.be.false;
  });

  it('should prevent Assessments castVote when PAUSE_ASSESSMENTS is active', async function () {
    const fixture = await loadFixture(setup);
    const { registry, assessments } = fixture.contracts;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const [user] = fixture.accounts.members;

    // Set assessments pause via emergency admin flow
    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_ASSESSMENTS);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_ASSESSMENTS);

    // castVote should fail with dummy parameters
    await expect(assessments.connect(user).castVote(1, true, ethers.ZeroHash))
      .to.be.revertedWithCustomError(assessments, 'Paused')
      .withArgs(PauseTypes.PAUSE_ASSESSMENTS, PauseTypes.PAUSE_ASSESSMENTS);
  });

  it('should prevent Claims functions when PAUSE_CLAIMS is active', async function () {
    const fixture = await loadFixture(setup);
    const { registry, claims } = fixture.contracts;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const [user] = fixture.accounts.members;

    // Set claims pause via emergency admin flow
    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_CLAIMS);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_CLAIMS);

    // All Claims functions should fail with claims pause
    await expect(claims.connect(user).submitClaim(1, 1000, ethers.ZeroHash, { value: ethers.parseEther('0.01') }))
      .to.be.revertedWithCustomError(claims, 'Paused')
      .withArgs(PauseTypes.PAUSE_CLAIMS, PauseTypes.PAUSE_CLAIMS);

    await expect(claims.connect(user).redeemClaimPayout(1))
      .to.be.revertedWithCustomError(claims, 'Paused')
      .withArgs(PauseTypes.PAUSE_CLAIMS, PauseTypes.PAUSE_CLAIMS);

    await expect(claims.connect(user).retrieveDeposit(1))
      .to.be.revertedWithCustomError(claims, 'Paused')
      .withArgs(PauseTypes.PAUSE_CLAIMS, PauseTypes.PAUSE_CLAIMS);
  });

  it('should prevent RAMM functions when PAUSE_RAMM is active', async function () {
    const fixture = await loadFixture(setup);
    const { registry, ramm } = fixture.contracts;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const [user] = fixture.accounts.members;

    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_RAMM);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_RAMM);

    const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    await expect(ramm.connect(user).swap(0, 0, deadline, { value: ethers.parseEther('1') }))
      .to.be.revertedWithCustomError(ramm, 'Paused')
      .withArgs(PauseTypes.PAUSE_RAMM, PauseTypes.PAUSE_RAMM);

    await expect(ramm.updateTwap())
      .to.be.revertedWithCustomError(ramm, 'Paused')
      .withArgs(PauseTypes.PAUSE_RAMM, PauseTypes.PAUSE_RAMM);

    await expect(ramm.getInternalPriceAndUpdateTwap())
      .to.be.revertedWithCustomError(ramm, 'Paused')
      .withArgs(PauseTypes.PAUSE_RAMM, PauseTypes.PAUSE_RAMM);
  });

  it('should prevent SwapOperator requestAssetSwap when PAUSE_SWAPS is active', async function () {
    const fixture = await loadFixture(setup);
    const { registry, swapOperator, dai, governor } = fixture.contracts;
    const [ea1, ea2] = fixture.accounts.emergencyAdmins;
    const timestamp = Math.floor(Date.now() / 1000);

    await registry.connect(ea1).proposePauseConfig(PauseTypes.PAUSE_SWAPS);
    await registry.connect(ea2).confirmPauseConfig(PauseTypes.PAUSE_SWAPS);

    await impersonateAccount(governor.target);
    const governorSigner = await ethers.getSigner(governor.target);
    await setBalance(governor.target, ethers.parseEther('1'));

    // requestAssetSwap should fail
    const requestAssetSwapTx = swapOperator.connect(governorSigner).requestAssetSwap({
      fromAsset: Assets.ETH,
      toAsset: dai,
      fromAmount: ethers.parseEther('1'),
      toAmount: ethers.parseEther('2000'),
      deadline: timestamp + 3600,
      swapKind: SwapKind.ExactInput,
    });

    await expect(requestAssetSwapTx)
      .to.be.revertedWithCustomError(swapOperator, 'Paused')
      .withArgs(PauseTypes.PAUSE_SWAPS, PauseTypes.PAUSE_SWAPS);
  });
});
