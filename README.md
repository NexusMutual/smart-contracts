# [Nexus Mutual](https://app.nexusmutual.io/)

[![Coverage Status](https://coveralls.io/repos/github/NexusMutual/smart-contracts/badge.svg)](https://coveralls.io/github/NexusMutual/smart-contracts)

## Getting Started

- **Requirements**: `Node >= 18`
- **Install**: `npm i` 
- **Test**: `npm test` 
- **Deploy**: `npm run deploy-local` 

## Smart Contracts Details

- [Mainnet Addresses](https://sdk.nexusmutual.io)

## Releasing

`@nexusmutual/deployments` is published by the **Release** workflow, run from the Actions tab. Dispatch it and pick a channel:

- **next** builds a release candidate (`3.5.0-rc.0`) from `release-candidate` and publishes it under the `next` tag, leaving git untouched.
- **latest** commits the version bump to `release-candidate`, fast-forwards `master` to it, publishes under the `latest` tag, and creates the git tag and GitHub release.

Both take the version from [Conventional Commits](https://www.conventionalcommits.org/) since the last tag. A release needs at least one commit typed beyond `docs`, `style`, `test` and `ci`.

The publish step ships the artifact built during preparation.

### Required setup

The release runs against a `production` [environment](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments) holding `DEPLOYER_APP_ID` and `DEPLOYER_APP_PK`, the credentials for the deployer GitHub App. Install that app on this repository and allow it to push to the branches the release writes to.

Publishing authenticates through [trusted publishing](https://docs.npmjs.com/trusted-publishers). The publish job requests `id-token: write`, and npm registers the package against this repository and `.github/workflows/release.yml`.

Trusted publishing authorises a workflow file, so both channels publish from `release.yml`. Update the npm registration whenever that file is renamed.

## Audits

- [Check the docs for a full list of security audits](https://docs.nexusmutual.io/resources/audits-and-security)

## Bug Bounty

- [Smart Contracts Bug Bounty](https://immunefi.com/bounty/nexusmutual/)
