const { ethers } = require('hardhat');
const { expect } = require('chai');

const { InternalContractsIDs } = require('../utils').constants;
const { hex } = require('../utils').helpers;

const { AddressZero } = ethers.constants;

describe('changeDependentContractAddress', function () {
  it('should change authorized address for the role', async function () {
    const { quotationData, memberRoles, master } = this.contracts;
    const { governanceContracts, defaultSender } = this.accounts;

    await quotationData.connect(governanceContracts[0]).setKycAuthAddress(defaultSender.address);
    await memberRoles.connect(governanceContracts[0]).setKycAuthAddress(quotationData.address);

    const tkAddressBefore = await memberRoles.internalContracts(InternalContractsIDs.TK);
    const tcAddressBefore = await memberRoles.internalContracts(InternalContractsIDs.TC);
    const p1AddressBefore = await memberRoles.internalContracts(InternalContractsIDs.P1);
    const coAddressBefore = await memberRoles.internalContracts(InternalContractsIDs.CO);

    await master.setLatestAddress(hex('CO'), AddressZero);
    await master.setTokenAddress(AddressZero);
    await master.setLatestAddress(hex('TC'), AddressZero);
    await master.setLatestAddress(hex('P1'), AddressZero);

    await memberRoles.changeDependentContractAddress();
    const tkAddressAfter = await memberRoles.internalContracts(InternalContractsIDs.TK);
    const tcAddressAfter = await memberRoles.internalContracts(InternalContractsIDs.TC);
    const p1AddressAfter = await memberRoles.internalContracts(InternalContractsIDs.P1);
    const coAddressAfter = await memberRoles.internalContracts(InternalContractsIDs.CO);

    expect(tkAddressAfter).not.to.be.equal(tkAddressBefore);
    expect(p1AddressAfter).not.to.be.equal(tcAddressBefore);
    expect(tcAddressAfter).not.to.be.equal(p1AddressBefore);
    expect(coAddressAfter).not.to.be.equal(coAddressBefore);

    expect(tkAddressAfter).to.be.equal(AddressZero);
    expect(tcAddressAfter).to.be.equal(AddressZero);
    expect(p1AddressAfter).to.be.equal(AddressZero);
    expect(coAddressAfter).to.be.equal(AddressZero);
  });
});
