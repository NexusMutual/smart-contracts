const { InternalContractsIDs } = require('../utils').constants;
const { expect } = require('chai');
const { hex } = require('../../../lib/helpers');
const { ZERO_ADDRESS } = require('../../../lib/constants');

describe('changeDependentContractAddress', function () {
  before(async function () {
    const { quotationData, memberRoles } = this.contracts;
    const { governanceContracts, defaultSender } = this.accounts;
    await quotationData.connect(governanceContracts[0]).setKycAuthAddress(defaultSender.address);
    await memberRoles.connect(governanceContracts[0]).setKycAuthAddress(quotationData.address);
  });

  it('should change authorized address for the role', async function () {
    const { memberRoles, master } = this.contracts;

    const tkAddressBefore = await memberRoles.internalContracts(InternalContractsIDs.TK);
    const tcAddressBefore = await memberRoles.internalContracts(InternalContractsIDs.TC);
    const p1AddressBefore = await memberRoles.internalContracts(InternalContractsIDs.P1);
    const coAddressBefore = await memberRoles.internalContracts(InternalContractsIDs.CO);

    await Promise.all([
      master.setLatestAddress(hex('CO'), ZERO_ADDRESS),
      master.setTokenAddress(ZERO_ADDRESS),
      master.setLatestAddress(hex('TC'), ZERO_ADDRESS),
      master.setLatestAddress(hex('P1'), ZERO_ADDRESS),
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

    expect(tkAddressAfter).to.be.equal(ZERO_ADDRESS);
    expect(tcAddressAfter).to.be.equal(ZERO_ADDRESS);
    expect(p1AddressAfter).to.be.equal(ZERO_ADDRESS);
    expect(coAddressAfter).to.be.equal(ZERO_ADDRESS);
  });
});
