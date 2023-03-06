const { config } = require('hardhat');
const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');

const extractStorageLayout = require(path.join(config.paths.root, 'scripts/extract-storage-layout'));

const cleanupType = type => {
  return (
    type
      // t_mapping(t_uint256,t_struct(CoverInfo)32880_storage)
      // ->
      // t_mapping(t_uint256,t_struct(CoverInfo)_storage)
      .replace(/\)\d+/, ')')
      // 2. replace contract types with t_address
      .replace(/t_contract\([^)]+\)/, 't_address')
      // 2. ignore payable specifier for addresses
      .replace(/t_address_payable/, 't_address')
  );
};

describe('Storage layout', function () {
  it('compare storage layout of proxy upgradable contracts', async function () {
    // generate v2 storage layout on the fly
    // only commit the layout json when we release a new version!
    const tempPath = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-'));
    const v2StorageFile = path.join(tempPath, 'v2.json');

    await extractStorageLayout(v2StorageFile);

    const previousLayout = require(path.join(__dirname, './storage/v1.json'));
    const currentLayout = require(v2StorageFile);

    // proxy contracts
    const contractsToCompare = [
      'NXMaster',
      'Governance',
      'ProposalCategory',
      'MemberRoles',
      ['PooledStaking', 'LegacyPooledStaking'],
      ['Gateway', 'LegacyGateway'],
      'TokenController',
    ];

    // Exceptions / overrides
    // Use old contract/label as keys and define overrides. All items are optional.
    // OldContractName: {
    //   oldVariableName: {
    //     label: 'newVariableName',
    //     size: [oldSize, newSize],
    //     type: ['oldType', 'newType'],
    //     deleted: true,
    //   },
    // }
    const exceptions = {
      PooledStaking: {
        initialized: { deleted: true },
        token: {
          label: 'internalContracts',
          size: [20, 32],
          type: ['t_address', 't_mapping(t_uint256,t_address)'],
        },
      },
      MemberRoles: {
        nxMasterAddress: {
          label: 'internalContracts',
          size: [20, 32],
          type: ['t_address', 't_mapping(t_uint256,t_address_payable)'],
        },
        ms: { label: 'master' },
        qd: { label: 'kycAuthAddress' },
      },
      Gateway: {
        quotation: {
          label: 'internalContracts',
          size: [20, 32],
          type: ['t_address', 't_mapping(t_uint256,t_address)'],
        },
      },
      TokenController: {
        nxMasterAddress: {
          label: 'internalContracts',
          size: [20, 32],
          type: ['t_address', 't_mapping(t_uint256,t_address)'],
        },
        ms: { label: 'master' },
      },
    };

    contractsToCompare.forEach(contract => {
      const [v1ContractName, v2ContractName] = [contract, contract].flat();
      const contractBefore = previousLayout[v1ContractName];
      const contractAfter = currentLayout[v2ContractName];

      contractBefore.forEach(varV1 => {
        // check if we have an exception for this variable
        const { [varV1.label]: exception = {} } = exceptions[v1ContractName] || {};

        if (exception.deleted) {
          return;
        }

        // find the variable in the new layout
        const varV2 = contractAfter.find(({ slot, offset }) => slot === varV1.slot && offset === varV1.offset);
        expect(
          varV2,
          `${varV1.label} not found in ${v2ContractName} at slot ${varV1.slot} and offset ${varV1.slot}`,
        ).not.to.be.equal(undefined);

        // compose identifying error message
        const v1Id = `${v1ContractName}.${varV1.label}`;
        const v2Id = `${v2ContractName}.${varV2.label}`;
        const identifier = `${v1Id} vs ${v2Id} at slot ${varV1.slot} and offset ${varV1.offset}`;

        // apply overrides
        if (exception) {
          const overrides = {};

          if (exception.label) {
            overrides.label = exception.label;
          }

          if (exception.size) {
            const [oldSize, newSize] = exception.size;
            expect(varV1.size, `Exception size mismatch ${identifier}`).to.be.equal(oldSize);
            overrides.size = newSize;
          }

          if (exception.type) {
            const [oldType, newType] = exception.type;
            expect(cleanupType(varV1.type), `Exception type mismatch ${identifier}`).to.be.equal(oldType);
            overrides.type = newType;
          }

          Object.assign(varV1, overrides);
        }

        // check name
        if (!/_unused/.test(varV2.label)) {
          expect(varV2.label, `Label mismatch in ${identifier}`).to.be.equal(varV1.label);
        }

        // check type
        expect(cleanupType(varV2.type), `Type mismatch in ${identifier}`).to.be.equal(cleanupType(varV1.type));

        // check size
        expect(varV1.size, `Size mismatch in ${identifier}`).to.be.equal(varV2.size);
      });
    });
  });
});
