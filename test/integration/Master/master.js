const { ethers } = require('hardhat');
const { assert, expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');
const { ProposalCategory, ContractTypes } = require('../utils').constants;
const { submitProposal } = require('../utils').governance;
const { hex } = require('../utils').helpers;
const { parseEther, defaultAbiCoder } = ethers.utils;
const { AddressZero } = ethers.constants;
const { BigNumber } = ethers;

const MAX_ADDRESS = '0xffffffffffffffffffffffffffffffffffffffff';

async function assertNewAddresses(master, contractCodes, newAddresses, contractType) {
  for (let i = 0; i < contractCodes.length; i++) {
    const code = contractCodes[i];
    const expectedAddress = newAddresses[i];
    if (contractType(code) === ContractTypes.Replaceable) {
      const address = await master.getLatestAddress(hex(code));
      assert.equal(address, expectedAddress);
    } else {
      const proxyAddress = await master.getLatestAddress(hex(code));
      const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', proxyAddress);
      const implementation = await proxy.implementation();
      assert.equal(
        implementation,
        expectedAddress,
        `Expected address ${expectedAddress} for ${code} does not match ${implementation}`,
      );
    }
  }
}

const encoder = (types, values) => {
  const abiCoder = ethers.utils.defaultAbiCoder;
  const encodedParams = abiCoder.encode(types, values);
  return encodedParams.slice(2);
};

describe('master', function () {
  it('adds new replaceable contract which can execute internal functions', async function () {
    const fixture = await loadFixture(setup);
    const { master, gv } = fixture.contracts;

    const code = hex('XX');

    const MSMockNewContract = await ethers.getContractFactory('MSMockNewContract');
    const newContract = await MSMockNewContract.deploy();

    const actionData = defaultAbiCoder.encode(
      ['bytes2[]', 'address[]', 'uint[]'],
      [[code], [newContract.address], [ContractTypes.Replaceable]],
    );

    await submitProposal(gv, ProposalCategory.newContracts, actionData, [
      fixture.accounts.defaultSender,
      ...fixture.accounts.advisoryBoardMembers,
    ]);

    const address = await master.getLatestAddress(code);
    assert.equal(address, newContract.address);

    // can perform onlyInternal action
    await newContract.mint(fixture.accounts.defaultSender.address, parseEther('1'));
  });

  it('adds new proxy contract which can execute internal functions', async function () {
    const fixture = await loadFixture(setup);
    const { master, gv } = fixture.contracts;

    const MSMockNewContract = await ethers.getContractFactory('MSMockNewContract');
    const newContract = await MSMockNewContract.deploy();

    const code = hex('XX');
    const actionData = defaultAbiCoder.encode(
      ['bytes2[]', 'address[]', 'uint[]'],
      [[code], [newContract.address], [ContractTypes.Proxy]],
    );
    await submitProposal(gv, ProposalCategory.newContracts, actionData, [
      fixture.accounts.defaultSender,
      ...fixture.accounts.advisoryBoardMembers,
    ]);

    const address = await master.getLatestAddress(code);
    const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', address);
    const implementation = await proxy.implementation();
    assert.equal(implementation, newContract.address);

    const newContractInstance = await ethers.getContractAt('MSMockNewContract', address);
    // can perform onlyInternal action
    await newContractInstance.mint(fixture.accounts.defaultSender.address, parseEther('1'));
  });

  it('adds new proxy contract with a predictable address', async function () {
    const fixture = await loadFixture(setup);
    const { master, gv } = fixture.contracts;

    const MSMockNewContract = await ethers.getContractFactory('MSMockNewContract');
    const newContract = await MSMockNewContract.deploy();

    const salt = 2;

    const contractTypeAndSalt = BigNumber.from(2).shl(8).add(ContractTypes.Proxy);

    const code = hex('XX');
    const actionData = defaultAbiCoder.encode(
      ['bytes2[]', 'address[]', 'uint[]'],
      [[code], [newContract.address], [contractTypeAndSalt]],
    );
    await submitProposal(gv, ProposalCategory.newContracts, actionData, [
      fixture.accounts.defaultSender,
      ...fixture.accounts.advisoryBoardMembers,
    ]);

    const address = await master.getLatestAddress(code);
    const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', address);

    const implementation = await proxy.implementation();
    assert.equal(implementation, newContract.address);

    const OwnedUpgradeabilityProxy = await ethers.getContractFactory('OwnedUpgradeabilityProxy');

    const saltHex = Buffer.from(salt.toString(16).padStart(64, '0'), 'hex');

    const initCode = OwnedUpgradeabilityProxy.bytecode + encoder(['address'], [MAX_ADDRESS]);
    const initCodeHash = ethers.utils.keccak256(initCode);

    const expectedProxyAddress = ethers.utils.getCreate2Address(master.address, saltHex, initCodeHash);

    expect(proxy.address).to.be.equal(expectedProxyAddress);
  });

  it('replace contract', async function () {
    const fixture = await loadFixture(setup);
    const { master, gv } = fixture.contracts;

    const code = hex('MC');
    const MCR = await ethers.getContractFactory('MCR');
    const newMCR = await MCR.deploy(master.address, 0);

    const contractCodes = [code];
    const newAddresses = [newMCR.address];

    const upgradeContractsData = defaultAbiCoder.encode(['bytes2[]', 'address[]'], [contractCodes, newAddresses]);

    await submitProposal(gv, ProposalCategory.upgradeMultipleContracts, upgradeContractsData, [
      fixture.accounts.defaultSender,
      ...fixture.accounts.advisoryBoardMembers,
    ]);

    const address = await master.getLatestAddress(code);
    assert.equal(address, newMCR.address);
  });

  it('upgrade proxy contract', async function () {
    const fixture = await loadFixture(setup);
    const { master, gv, spf, tk, stakingNFT } = fixture.contracts;

    const code = hex('TC');
    const TokenController = await ethers.getContractFactory('TokenController');
    const newTokenControllerImplementation = await TokenController.deploy(spf.address, tk.address, stakingNFT.address);

    const contractCodes = [code];
    const newAddresses = [newTokenControllerImplementation.address];

    const upgradeContractsData = defaultAbiCoder.encode(['bytes2[]', 'address[]'], [contractCodes, newAddresses]);

    await submitProposal(gv, ProposalCategory.upgradeMultipleContracts, upgradeContractsData, [
      fixture.accounts.defaultSender,
      ...fixture.accounts.advisoryBoardMembers,
    ]);

    const address = await master.getLatestAddress(code);

    const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', address);
    const implementation = await proxy.implementation();
    assert.equal(implementation, newTokenControllerImplementation.address);
  });

  it('upgrade proxies and replaceables', async function () {
    const fixture = await loadFixture(setup);
    const { master, gv, spf, stakingNFT, tk } = fixture.contracts;

    const mcrCode = hex('MC');
    const tcCode = hex('TC');

    const MCR = await ethers.getContractFactory('MCR');
    const newMCR = await MCR.deploy(master.address, 0);
    const TokenController = await ethers.getContractFactory('TokenController');
    const newTokenControllerImplementation = await TokenController.deploy(spf.address, tk.address, stakingNFT.address);

    const contractCodes = [mcrCode, tcCode];
    const newAddresses = [newMCR.address, newTokenControllerImplementation.address];

    const upgradeContractsData = defaultAbiCoder.encode(['bytes2[]', 'address[]'], [contractCodes, newAddresses]);

    await submitProposal(gv, ProposalCategory.upgradeMultipleContracts, upgradeContractsData, [
      fixture.accounts.defaultSender,
      ...fixture.accounts.advisoryBoardMembers,
    ]);

    const tcAddress = await master.getLatestAddress(tcCode);
    const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', tcAddress);
    const implementation = await proxy.implementation();
    assert.equal(implementation, newTokenControllerImplementation.address);

    const address = await master.getLatestAddress(mcrCode);
    assert.equal(address, newMCR.address);
  });

  it('upgrades master', async function () {
    const fixture = await loadFixture(setup);
    const { master, gv } = fixture.contracts;

    const NXMaster = await ethers.getContractFactory('NXMaster');
    const newMaster = await NXMaster.deploy();

    const upgradeContractsData = defaultAbiCoder.encode(['address'], [newMaster.address]);

    await submitProposal(gv, ProposalCategory.upgradeMaster, upgradeContractsData, [
      fixture.accounts.defaultSender,
      ...fixture.accounts.advisoryBoardMembers,
    ]);

    const proxy = await ethers.getContractAt('OwnedUpgradeabilityProxy', master.address);
    const implementation = await proxy.implementation();
    assert.equal(implementation, newMaster.address);
  });

  it('upgrades all contracts', async function () {
    const fixture = await loadFixture(setup);
    const { master, gv, dai, priceFeedOracle, p1, tk, spf, stakingNFT, coverNFT } = fixture.contracts;

    const TokenController = await ethers.getContractFactory('TokenController');
    const MCR = await ethers.getContractFactory('MCR');
    const Pool = await ethers.getContractFactory('Pool');
    const Governance = await ethers.getContractFactory('Governance');
    const ProposalCategoryContract = await ethers.getContractFactory('ProposalCategory');
    const MemberRoles = await ethers.getContractFactory('MemberRoles');
    const IndividualClaims = await ethers.getContractFactory('IndividualClaims');

    const pool = await Pool.deploy(master.address, priceFeedOracle.address, AddressZero, tk.address, p1.address);

    const contractCodes = ['TC', 'P1', 'MC', 'GV', 'PC', 'MR', 'CI'];
    const newAddresses = [
      await TokenController.deploy(spf.address, tk.address, stakingNFT.address),
      pool,
      await MCR.deploy(master.address, 0),
      await Governance.deploy(),
      await ProposalCategoryContract.deploy(),
      await MemberRoles.deploy(tk.address),
      await IndividualClaims.deploy(coverNFT.address),
    ].map(c => {
      return c.address;
    });

    const upgradeContractsData = defaultAbiCoder.encode(
      ['bytes2[]', 'address[]'],
      [contractCodes.map(code => hex(code)), newAddresses],
    );

    const poolEthBalanceBefore = await ethers.provider.getBalance(p1.address);
    const poolDaiBalanceBefore = await dai.balanceOf(p1.address);

    await submitProposal(gv, ProposalCategory.upgradeMultipleContracts, upgradeContractsData, [
      fixture.accounts.defaultSender,
      ...fixture.accounts.advisoryBoardMembers,
    ]);

    await assertNewAddresses(master, contractCodes, newAddresses, fixture.contractType);

    const newPoolAddress = await master.getLatestAddress(hex('P1'));

    const poolEthBalanceAfter = await ethers.provider.getBalance(newPoolAddress);
    const poolDaiBalanceAfter = await dai.balanceOf(newPoolAddress);

    expect(poolEthBalanceBefore).to.be.equal(poolEthBalanceAfter);
    expect(poolDaiBalanceBefore).to.be.equal(poolDaiBalanceAfter);
  });

  it('upgrades Governance, TokenController and MemberRoles 2 times in a row', async function () {
    const fixture = await loadFixture(setup);
    const { master, gv, spf, stakingNFT, tk } = fixture.contracts;

    const TokenController = await ethers.getContractFactory('TokenController');
    const MemberRoles = await ethers.getContractFactory('MemberRoles');
    const Governance = await ethers.getContractFactory('Governance');

    {
      const contractCodes = ['TC', 'GV', 'MR'];
      const newAddresses = [
        await TokenController.deploy(spf.address, tk.address, stakingNFT.address),
        await Governance.deploy(),
        await MemberRoles.deploy(tk.address),
      ].map(c => c.address);

      const upgradeContractsData = defaultAbiCoder.encode(
        ['bytes2[]', 'address[]'],
        [contractCodes.map(code => hex(code)), newAddresses],
      );

      await submitProposal(gv, ProposalCategory.upgradeMultipleContracts, upgradeContractsData, [
        fixture.accounts.defaultSender,
        ...fixture.accounts.advisoryBoardMembers,
      ]);
      await assertNewAddresses(master, contractCodes, newAddresses, fixture.contractType);
    }

    {
      const contractCodes = ['TC', 'GV', 'MR'];
      const newAddresses = [
        await TokenController.deploy(spf.address, tk.address, stakingNFT.address),
        await Governance.deploy(),
        await MemberRoles.deploy(tk.address),
      ].map(c => c.address);

      const upgradeContractsData = defaultAbiCoder.encode(
        ['bytes2[]', 'address[]'],
        [contractCodes.map(code => hex(code)), newAddresses],
      );

      await submitProposal(gv, ProposalCategory.upgradeMultipleContracts, upgradeContractsData, [
        fixture.accounts.defaultSender,
        ...fixture.accounts.advisoryBoardMembers,
      ]);
      await assertNewAddresses(master, contractCodes, newAddresses, fixture.contractType);
    }
  });

  it('removes newly added replaceable contract and existing contract', async function () {
    const fixture = await loadFixture(setup);
    const { master, gv } = fixture.contracts;

    const code = hex('RE');
    const existingCode = hex('CO');
    const MSMockNewContract = await ethers.getContractFactory('MSMockNewContract');
    const newContract = await MSMockNewContract.deploy();
    const actionData = defaultAbiCoder.encode(
      ['bytes2[]', 'address[]', 'uint[]'],
      [[code], [newContract.address], [ContractTypes.Replaceable]],
    );
    await submitProposal(gv, ProposalCategory.newContracts, actionData, [
      fixture.accounts.defaultSender,
      ...fixture.accounts.advisoryBoardMembers,
    ]);

    const address = await master.getLatestAddress(code);
    assert.equal(address, newContract.address);

    const actionDataRemove = defaultAbiCoder.encode(['bytes2[]'], [[code, existingCode]]);
    await submitProposal(gv, ProposalCategory.removeContracts, actionDataRemove, [
      fixture.accounts.defaultSender,
      ...fixture.accounts.advisoryBoardMembers,
    ]);

    {
      const addressAfterDeletion = await master.getLatestAddress(code);
      assert.equal(addressAfterDeletion, AddressZero);
      const isInternal = await master.isInternal(newContract.address);
      assert.equal(isInternal, false);
    }

    {
      const addressAfterDeletion = await master.getLatestAddress(existingCode);
      assert.equal(addressAfterDeletion, AddressZero);
      const isInternal = await master.isInternal(newContract.address);
      assert.equal(isInternal, false);
    }
  });
});
