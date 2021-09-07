const { accounts, web3 } = require('hardhat');
const { expectEvent, expectRevert, time, ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { ProposalCategory, ContractTypes } = require('../utils').constants;
const { submitProposal } = require('../utils').governance;
const { hex, bnEqual } = require('../utils').helpers;

const [owner] = accounts;

const Claims = artifacts.require('LegacyClaims');
const ClaimsReward = artifacts.require('LegacyClaimsReward');
const MCR = artifacts.require('DisposableMCR');
const TokenFunctions = artifacts.require('TokenFunctions');
const Pool = artifacts.require('Pool');
const Quotation = artifacts.require('Quotation');
const NXMaster = artifacts.require('NXMaster');
const MemberRoles = artifacts.require('MemberRoles');
const TokenController = artifacts.require('TokenController');
const Governance = artifacts.require('Governance');
const PooledStaking = artifacts.require('PooledStaking');
const Gateway = artifacts.require('Gateway');
const Incidents = artifacts.require('Incidents');
const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const MMockNewContract = artifacts.require('MMockNewContract');
const ProposalCategoryContract = artifacts.require('ProposalCategory');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

async function assertNewAddresses (master, contractCodes, newAddresses, contractType) {
  for (let i = 0; i < contractCodes.length; i++) {
    const code = contractCodes[i];
    const expectedAddress = newAddresses[i];
    if (contractType(code) === ContractTypes.Replaceable) {
      const address = await master.getLatestAddress(hex(code));
      assert.equal(address, expectedAddress);
    } else {
      const proxyAddress = await master.getLatestAddress(hex(code));
      const implementation = await (await OwnedUpgradeabilityProxy.at(proxyAddress)).implementation();
      assert.equal(
        implementation,
        expectedAddress,
        `Expected address ${expectedAddress} for ${code} does not match ${implementation}`,
      );
    }
  }
}

describe('master', function () {
  it('adds new replaceable contract which can execute internal functions', async function () {
    const { master, gv } = this.contracts;

    const code = hex('XX');
    const newContract = await MMockNewContract.new();
    const actionData = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]', 'uint[]'],
      [[code], [newContract.address], [ContractTypes.Replaceable]],
    );
    await submitProposal(gv, ProposalCategory.newContracts, actionData, [owner]);

    const address = await master.getLatestAddress(code);
    assert.equal(address, newContract.address);

    // can perform onlyInternal action
    await newContract.mint(owner, ether('1'));
  });

  it('adds new proxy contract which can execute internal functions', async function () {
    const { master, gv } = this.contracts;

    const code = hex('XX');
    const newContract = await MMockNewContract.new();
    const actionData = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]', 'uint[]'],
      [[code], [newContract.address], [ContractTypes.Proxy]],
    );
    await submitProposal(gv, ProposalCategory.newContracts, actionData, [owner]);

    const address = await master.getLatestAddress(code);
    const implementation = await (await OwnedUpgradeabilityProxy.at(address)).implementation();
    assert.equal(implementation, newContract.address);

    const newContractInstance = await MMockNewContract.at(address);
    // can perform onlyInternal action
    await newContractInstance.mint(owner, ether('1'));
  });

  it('replace contract', async function () {
    const { master, gv } = this.contracts;

    const code = hex('QT');
    const quotation = await Quotation.new();

    const contractCodes = [code];
    const newAddresses = [quotation.address];

    const upgradeContractsData = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [contractCodes, newAddresses],
    );

    await submitProposal(gv, ProposalCategory.upgradeNonProxy, upgradeContractsData, [owner]);

    const address = await master.getLatestAddress(code);
    assert.equal(address, quotation.address);
  });

  it('upgrade proxy contract', async function () {
    const { master, gv, pc, tk } = this.contracts;

    const code = hex('PS');
    const pooledStaking = await PooledStaking.new();

    const contractCodes = [code];
    const newAddresses = [pooledStaking.address];

    const upgradeContractsData = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [contractCodes, newAddresses],
    );

    await submitProposal(gv, ProposalCategory.upgradeNonProxy, upgradeContractsData, [owner]);

    const address = await master.getLatestAddress(code);

    const implementation = await (await OwnedUpgradeabilityProxy.at(address)).implementation();
    assert.equal(implementation, pooledStaking.address);
  });

  it('upgrade proxies and replaceables', async function () {
    const { master, gv, pc, tk } = this.contracts;

    const psCode = hex('PS');
    const qtCode = hex('QT');
    const pooledStaking = await PooledStaking.new();
    const quotation = await Quotation.new();

    const contractCodes = [psCode, qtCode];
    const newAddresses = [pooledStaking.address, quotation.address];

    const upgradeContractsData = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [contractCodes, newAddresses],
    );

    await submitProposal(gv, ProposalCategory.upgradeNonProxy, upgradeContractsData, [owner]);

    const psAddress = await master.getLatestAddress(psCode);

    const implementation = await (await OwnedUpgradeabilityProxy.at(psAddress)).implementation();
    assert.equal(implementation, pooledStaking.address);

    const address = await master.getLatestAddress(qtCode);
    assert.equal(address, quotation.address);
  });

  it('upgrades master', async function () {
    const { master, gv } = this.contracts;

    const code = hex('MS');
    const newMaster = await NXMaster.new();

    const upgradeContractsData = web3.eth.abi.encodeParameters(['address'], [newMaster.address]);

    await submitProposal(gv, ProposalCategory.upgradeMaster, upgradeContractsData, [owner]);

    const implementation = await (await OwnedUpgradeabilityProxy.at(master.address)).implementation();
    assert.equal(implementation, newMaster.address);
  });

  it('upgrades all contracts', async function () {
    const { master, gv, dai, priceFeedOracle, p1, cr, tk: token } = this.contracts;

    const contractCodes = ['QT', 'TF', 'TC', 'CL', 'CR', 'P1', 'MC', 'GV', 'PC', 'MR', 'PS', 'GW', 'IC'];
    const newAddresses = [
      await Quotation.new(),
      await TokenFunctions.new(),
      await TokenController.new(),
      await Claims.new(),
      await ClaimsReward.new(master.address, dai.address),
      await Pool.new(
        [dai.address], // assets
        [0], // min amounts
        [ether('100')], // max amounts
        [ether('0.01')], // max slippage 1%
        master.address,
        priceFeedOracle.address,
        ZERO_ADDRESS,
      ),
      await MCR.new(ZERO_ADDRESS),
      await Governance.new(),
      await ProposalCategoryContract.new(),
      await MemberRoles.new(),
      await PooledStaking.new(),
      await Gateway.new(),
      await Incidents.new(),
    ].map(c => c.address);

    const upgradeContractsData = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]'],
      [contractCodes.map(code => hex(code)), newAddresses],
    );

    const poolEthBalanceBefore = await web3.eth.getBalance(p1.address);
    const poolDaiBalanceBefore = await web3.eth.getBalance(p1.address);

    // store tokens in ClaimsReward
    await token.transfer(cr.address, ether('10'), {
      from: owner,
    });

    const claimsRewardNXMBalanceBefore = await token.balanceOf(cr.address);

    await submitProposal(gv, ProposalCategory.upgradeNonProxy, upgradeContractsData, [owner]);

    await assertNewAddresses(master, contractCodes, newAddresses, this.contractType);

    const newPool = await master.getLatestAddress(hex('P1'));

    const poolEthBalanceAfter = await web3.eth.getBalance(newPool);
    const poolDaiBalanceAfter = await web3.eth.getBalance(newPool);

    bnEqual(poolEthBalanceBefore, poolEthBalanceAfter);
    bnEqual(poolDaiBalanceBefore, poolDaiBalanceAfter);

    const claimsRewardNXMBalanceAfter = await token.balanceOf(await master.getLatestAddress(hex('CR')));
    bnEqual(claimsRewardNXMBalanceAfter, claimsRewardNXMBalanceBefore);
  });

  it('upgrades Governance, TokenController and MemberRoles 2 times in a row', async function () {
    const { master, gv } = this.contracts;
    {
      const contractCodes = ['TC', 'GV', 'MR'];
      const newAddresses = [await TokenController.new(), await Governance.new(), await MemberRoles.new()].map(
        c => c.address,
      );

      const upgradeContractsData = web3.eth.abi.encodeParameters(
        ['bytes2[]', 'address[]'],
        [contractCodes.map(code => hex(code)), newAddresses],
      );

      await submitProposal(gv, ProposalCategory.upgradeNonProxy, upgradeContractsData, [owner]);
      await assertNewAddresses(master, contractCodes, newAddresses, this.contractType);
    }

    {
      const contractCodes = ['TC', 'GV', 'MR'];
      const newAddresses = [await TokenController.new(), await Governance.new(), await MemberRoles.new()].map(
        c => c.address,
      );

      const upgradeContractsData = web3.eth.abi.encodeParameters(
        ['bytes2[]', 'address[]'],
        [contractCodes.map(code => hex(code)), newAddresses],
      );

      await submitProposal(gv, ProposalCategory.upgradeNonProxy, upgradeContractsData, [owner]);
      await assertNewAddresses(master, contractCodes, newAddresses, this.contractType);
    }
  });

  it('removes newly added replaceable contract and existing contract', async function () {
    const { master, gv } = this.contracts;

    const code = hex('RE');
    const existingCode = hex('GW');
    const newContract = await MMockNewContract.new();
    const actionData = web3.eth.abi.encodeParameters(
      ['bytes2[]', 'address[]', 'uint[]'],
      [[code], [newContract.address], [ContractTypes.Replaceable]],
    );
    await submitProposal(gv, ProposalCategory.newContracts, actionData, [owner]);

    const address = await master.getLatestAddress(code);
    assert.equal(address, newContract.address);

    const actionDataRemove = web3.eth.abi.encodeParameters(['bytes2[]'], [[code, existingCode]]);
    await submitProposal(gv, ProposalCategory.removeContracts, actionDataRemove, [owner]);

    {
      const addressAfterDeletion = await master.getLatestAddress(code);
      assert.equal(addressAfterDeletion, ZERO_ADDRESS);
      const isInternal = await master.isInternal(newContract.address);
      assert.equal(isInternal, false);
    }

    {
      const addressAfterDeletion = await master.getLatestAddress(existingCode);
      assert.equal(addressAfterDeletion, ZERO_ADDRESS);
      const isInternal = await master.isInternal(newContract.address);
      assert.equal(isInternal, false);
    }
  });
});
