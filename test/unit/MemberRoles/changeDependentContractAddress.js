const { InternalContractsIDs } = require('../utils').constants;
const { expect } = require('chai');
const { hex } = require('../../../lib/helpers');
const {
  constants: { AddressZero },
} = require('ethers');

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

    await Promise.all([
      master.setLatestAddress(hex('CO'), AddressZero),
      master.setTokenAddress(AddressZero),
      master.setLatestAddress(hex('TC'), AddressZero),
      master.setLatestAddress(hex('P1'), AddressZero),
    ]);

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
