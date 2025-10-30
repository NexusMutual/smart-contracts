const { ethers, nexus } = require('hardhat');
const { expect } = require('chai');
const {
  loadFixture,
  impersonateAccount,
  setNextBlockBaseFeePerGas,
} = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { signJoinMessage } = nexus.signing;
const { toBytes2 } = nexus.helpers;
const { ZeroAddress } = ethers;
const JOINING_FEE = ethers.parseEther('0.002');

const abFixture = async () => {
  const fixture = await loadFixture(setup);
  const { registry, master, kycAuth, advisoryBoardMembers } = fixture;

  for (const ab of advisoryBoardMembers) {
    const signature = await signJoinMessage(kycAuth, ab, registry);
    await registry.connect(ab).join(ab, signature, { value: JOINING_FEE });
  }

  // todo: use DisposableRegistry in the future
  const mrAddress = await master.getLatestAddress(toBytes2('MR'));
  await impersonateAccount(mrAddress);
  const mrSigner = await ethers.getSigner(mrAddress);
  await setNextBlockBaseFeePerGas(0);
  await registry.connect(mrSigner).migrateAdvisoryBoardMembers(
    advisoryBoardMembers,
    { maxPriorityFeePerGas: 0 }, // overrides
  );

  return fixture;
};

describe('advisoryBoard', () => {
  it('should allow governor to swap advisory board members', async () => {
    const fixture = await loadFixture(abFixture);
    const { registry, alice, kycAuth, advisoryBoardMembers, governor } = fixture;
    const [abMember] = advisoryBoardMembers;

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, signature, { value: JOINING_FEE });

    const abSeat = await registry.getAdvisoryBoardSeat(abMember);
    const abMemberId = await registry.getMemberId(abMember);
    const aliceMemberId = await registry.getMemberId(alice);

    await expect(registry.getAdvisoryBoardSeat(alice)) // not ab
      .to.be.revertedWithCustomError(registry, 'NotAdvisoryBoardMember');

    await expect(registry.connect(governor).swapAdvisoryBoardMember(abMemberId, aliceMemberId))
      .to.emit(registry, 'AdvisoryBoardMemberSwapped')
      .withArgs(abSeat, abMemberId, aliceMemberId);

    expect(await registry.getAdvisoryBoardSeat(alice)).to.equal(abSeat);
  });

  it('should revert when called by non-governor', async () => {
    const fixture = await loadFixture(abFixture);
    const { registry, mallory } = fixture;
    await expect(registry.connect(mallory).swapAdvisoryBoardMember(0, 1)) // as mallory
      .to.be.revertedWithCustomError(registry, 'OnlyGovernor');
  });

  it('should revert when non-governor tries to swap advisory board members', async () => {
    const fixture = await loadFixture(abFixture);
    const { registry, mallory } = fixture;
    await expect(registry.connect(mallory).swapAdvisoryBoardMember(0, 1)) // as mallory
      .to.be.revertedWithCustomError(registry, 'OnlyGovernor');
  });

  it('should return expected values for ab and non members', async () => {
    const { registry, advisoryBoardMembers, alice, mallory } = await loadFixture(abFixture);

    for (const abMember of advisoryBoardMembers) {
      const abMemberId = await registry.getMemberId(abMember);
      const abSeat = await registry.getAdvisoryBoardSeat(abMember);
      expect(await registry.getMemberIdBySeat(abSeat)).to.equal(abMemberId);
      expect(await registry.getMemberAddressBySeat(abSeat)).to.equal(abMember);
      expect(await registry.isAdvisoryBoardMember(abMember)).to.be.true; // ab member
    }

    expect(await registry.isAdvisoryBoardMember(alice)).to.be.false; // member
    expect(await registry.isAdvisoryBoardMember(mallory)).to.be.false; // non member
    expect(await registry.isAdvisoryBoardMember(ZeroAddress)).to.be.false; // zero address
  });

  it('should revert when invalid seat is provided', async () => {
    const { registry } = await loadFixture(abFixture);

    const seats = await registry.ADVISORY_BOARD_SEATS(); // seat numbers start at 1
    await expect(registry.getMemberIdBySeat(1)).to.not.be.reverted;
    await expect(registry.getMemberIdBySeat(seats)).to.not.be.reverted;

    await expect(registry.getMemberIdBySeat(0)).to.be.revertedWithCustomError(registry, 'InvalidSeat');
    await expect(registry.getMemberAddressBySeat(0)).to.be.revertedWithCustomError(registry, 'InvalidSeat');

    await expect(registry.getMemberIdBySeat(seats + 1n)).to.be.revertedWithCustomError(registry, 'InvalidSeat');
    await expect(registry.getMemberAddressBySeat(seats + 1n)).to.be.revertedWithCustomError(registry, 'InvalidSeat');
  });

  it('should revert when the proposed member is already an ab member', async () => {
    const fixture = await loadFixture(abFixture);
    const { registry, alice, kycAuth, advisoryBoardMembers, governor } = fixture;
    const [firstAb, secondAb] = advisoryBoardMembers;

    const signature = await signJoinMessage(kycAuth, alice, registry);
    await registry.connect(alice).join(alice, signature, { value: JOINING_FEE });

    const firstAbId = await registry.getMemberId(firstAb);
    const secondAbId = await registry.getMemberId(secondAb);

    await expect(registry.connect(governor).swapAdvisoryBoardMember(firstAbId, secondAbId)) // ab to ab
      .to.be.revertedWithCustomError(registry, 'AlreadyAdvisoryBoardMember');
  });

  it('should revert if passed member ids are not valid', async () => {
    const fixture = await loadFixture(abFixture);
    const { registry, governor } = fixture;

    await expect(registry.connect(governor).swapAdvisoryBoardMember(0, 1)) // from not a valid member id
      .to.be.revertedWithCustomError(registry, 'NotMember');

    await expect(registry.connect(governor).swapAdvisoryBoardMember(100, 1)) // from not an ab member
      .to.be.revertedWithCustomError(registry, 'NotAdvisoryBoardMember');

    await expect(registry.connect(governor).swapAdvisoryBoardMember(1, 0)) // to not a valid member id
      .to.be.revertedWithCustomError(registry, 'NotMember');

    await expect(registry.connect(governor).swapAdvisoryBoardMember(1, 100)) // to not a member
      .to.be.revertedWithCustomError(registry, 'NotMember');
  });
});
