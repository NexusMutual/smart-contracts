/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import BN from "bn.js";
import { EventData, PastEventOptions } from "web3-eth-contract";

export interface TestnetNXMasterContract
  extends Truffle.Contract<TestnetNXMasterInstance> {
  "new"(meta?: Truffle.TransactionDetails): Promise<TestnetNXMasterInstance>;
}

type AllEvents = never;

export interface TestnetNXMasterInstance extends Truffle.ContractInstance {
  addEmergencyPause: {
    (
      _pause: boolean,
      _by: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<Truffle.TransactionResponse<AllEvents>>;
    call(
      _pause: boolean,
      _by: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<void>;
    sendTransaction(
      _pause: boolean,
      _by: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<string>;
    estimateGas(
      _pause: boolean,
      _by: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<number>;
  };

  addNewInternalContract: {
    (
      _contractName: string,
      _contractAddress: string,
      _type: number | BN | string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<Truffle.TransactionResponse<AllEvents>>;
    call(
      _contractName: string,
      _contractAddress: string,
      _type: number | BN | string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<void>;
    sendTransaction(
      _contractName: string,
      _contractAddress: string,
      _type: number | BN | string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<string>;
    estimateGas(
      _contractName: string,
      _contractAddress: string,
      _type: number | BN | string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<number>;
  };

  addNewVersion: {
    (
      _contractAddresses: string[],
      txDetails?: Truffle.TransactionDetails
    ): Promise<Truffle.TransactionResponse<AllEvents>>;
    call(
      _contractAddresses: string[],
      txDetails?: Truffle.TransactionDetails
    ): Promise<void>;
    sendTransaction(
      _contractAddresses: string[],
      txDetails?: Truffle.TransactionDetails
    ): Promise<string>;
    estimateGas(
      _contractAddresses: string[],
      txDetails?: Truffle.TransactionDetails
    ): Promise<number>;
  };

  checkIsAuthToGoverned(
    _add: string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<boolean>;

  closeClaim: {
    (
      _claimId: number | BN | string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<Truffle.TransactionResponse<AllEvents>>;
    call(
      _claimId: number | BN | string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<void>;
    sendTransaction(
      _claimId: number | BN | string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<string>;
    estimateGas(
      _claimId: number | BN | string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<number>;
  };

  contractsActive(
    arg0: string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<boolean>;

  dAppLocker(txDetails?: Truffle.TransactionDetails): Promise<string>;

  dAppToken(txDetails?: Truffle.TransactionDetails): Promise<string>;

  emergencyPaused(
    arg0: number | BN | string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<[boolean, BN, string]>;

  getEmergencyPausedLength(txDetails?: Truffle.TransactionDetails): Promise<BN>;

  getLastEmergencyPause(
    txDetails?: Truffle.TransactionDetails
  ): Promise<[boolean, BN, string]>;

  getLatestAddress(
    _contractName: string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<string>;

  getOwnerParameters(
    code: string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<[string, string]>;

  getVersionData(
    txDetails?: Truffle.TransactionDetails
  ): Promise<[string[], string[]]>;

  governanceOwner(txDetails?: Truffle.TransactionDetails): Promise<string>;

  initializeGovernanceOwner: {
    (txDetails?: Truffle.TransactionDetails): Promise<
      Truffle.TransactionResponse<AllEvents>
    >;
    call(txDetails?: Truffle.TransactionDetails): Promise<void>;
    sendTransaction(txDetails?: Truffle.TransactionDetails): Promise<string>;
    estimateGas(txDetails?: Truffle.TransactionDetails): Promise<number>;
  };

  isAuthorizedToGovern(
    _toCheck: string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<boolean>;

  isInternal(
    _contractAddress: string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<boolean>;

  isMember(
    _add: string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<boolean>;

  isOwner(
    _address: string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<boolean>;

  isPause(txDetails?: Truffle.TransactionDetails): Promise<boolean>;

  isProxy(
    arg0: string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<boolean>;

  isUpgradable(
    arg0: string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<boolean>;

  masterAddress(txDetails?: Truffle.TransactionDetails): Promise<string>;

  masterInitialized(txDetails?: Truffle.TransactionDetails): Promise<boolean>;

  owner(txDetails?: Truffle.TransactionDetails): Promise<string>;

  pauseTime(txDetails?: Truffle.TransactionDetails): Promise<BN>;

  startEmergencyPause: {
    (txDetails?: Truffle.TransactionDetails): Promise<
      Truffle.TransactionResponse<AllEvents>
    >;
    call(txDetails?: Truffle.TransactionDetails): Promise<void>;
    sendTransaction(txDetails?: Truffle.TransactionDetails): Promise<string>;
    estimateGas(txDetails?: Truffle.TransactionDetails): Promise<number>;
  };

  switchGovernanceAddress: {
    (newGV: string, txDetails?: Truffle.TransactionDetails): Promise<
      Truffle.TransactionResponse<AllEvents>
    >;
    call(newGV: string, txDetails?: Truffle.TransactionDetails): Promise<void>;
    sendTransaction(
      newGV: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<string>;
    estimateGas(
      newGV: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<number>;
  };

  tokenAddress(txDetails?: Truffle.TransactionDetails): Promise<string>;

  updateOwnerParameters: {
    (
      code: string,
      val: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<Truffle.TransactionResponse<AllEvents>>;
    call(
      code: string,
      val: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<void>;
    sendTransaction(
      code: string,
      val: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<string>;
    estimateGas(
      code: string,
      val: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<number>;
  };

  updatePauseTime: {
    (
      _time: number | BN | string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<Truffle.TransactionResponse<AllEvents>>;
    call(
      _time: number | BN | string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<void>;
    sendTransaction(
      _time: number | BN | string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<string>;
    estimateGas(
      _time: number | BN | string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<number>;
  };

  upgradeMultipleContracts: {
    (
      _contractsName: string[],
      _contractsAddress: string[],
      txDetails?: Truffle.TransactionDetails
    ): Promise<Truffle.TransactionResponse<AllEvents>>;
    call(
      _contractsName: string[],
      _contractsAddress: string[],
      txDetails?: Truffle.TransactionDetails
    ): Promise<void>;
    sendTransaction(
      _contractsName: string[],
      _contractsAddress: string[],
      txDetails?: Truffle.TransactionDetails
    ): Promise<string>;
    estimateGas(
      _contractsName: string[],
      _contractsAddress: string[],
      txDetails?: Truffle.TransactionDetails
    ): Promise<number>;
  };

  upgradeMultipleImplementations: {
    (
      _contractNames: string[],
      _contractAddresses: string[],
      txDetails?: Truffle.TransactionDetails
    ): Promise<Truffle.TransactionResponse<AllEvents>>;
    call(
      _contractNames: string[],
      _contractAddresses: string[],
      txDetails?: Truffle.TransactionDetails
    ): Promise<void>;
    sendTransaction(
      _contractNames: string[],
      _contractAddresses: string[],
      txDetails?: Truffle.TransactionDetails
    ): Promise<string>;
    estimateGas(
      _contractNames: string[],
      _contractAddresses: string[],
      txDetails?: Truffle.TransactionDetails
    ): Promise<number>;
  };

  methods: {
    addEmergencyPause: {
      (
        _pause: boolean,
        _by: string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<Truffle.TransactionResponse<AllEvents>>;
      call(
        _pause: boolean,
        _by: string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<void>;
      sendTransaction(
        _pause: boolean,
        _by: string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<string>;
      estimateGas(
        _pause: boolean,
        _by: string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<number>;
    };

    addNewInternalContract: {
      (
        _contractName: string,
        _contractAddress: string,
        _type: number | BN | string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<Truffle.TransactionResponse<AllEvents>>;
      call(
        _contractName: string,
        _contractAddress: string,
        _type: number | BN | string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<void>;
      sendTransaction(
        _contractName: string,
        _contractAddress: string,
        _type: number | BN | string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<string>;
      estimateGas(
        _contractName: string,
        _contractAddress: string,
        _type: number | BN | string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<number>;
    };

    addNewVersion: {
      (
        _contractAddresses: string[],
        txDetails?: Truffle.TransactionDetails
      ): Promise<Truffle.TransactionResponse<AllEvents>>;
      call(
        _contractAddresses: string[],
        txDetails?: Truffle.TransactionDetails
      ): Promise<void>;
      sendTransaction(
        _contractAddresses: string[],
        txDetails?: Truffle.TransactionDetails
      ): Promise<string>;
      estimateGas(
        _contractAddresses: string[],
        txDetails?: Truffle.TransactionDetails
      ): Promise<number>;
    };

    checkIsAuthToGoverned(
      _add: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<boolean>;

    closeClaim: {
      (
        _claimId: number | BN | string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<Truffle.TransactionResponse<AllEvents>>;
      call(
        _claimId: number | BN | string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<void>;
      sendTransaction(
        _claimId: number | BN | string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<string>;
      estimateGas(
        _claimId: number | BN | string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<number>;
    };

    contractsActive(
      arg0: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<boolean>;

    dAppLocker(txDetails?: Truffle.TransactionDetails): Promise<string>;

    dAppToken(txDetails?: Truffle.TransactionDetails): Promise<string>;

    emergencyPaused(
      arg0: number | BN | string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<[boolean, BN, string]>;

    getEmergencyPausedLength(
      txDetails?: Truffle.TransactionDetails
    ): Promise<BN>;

    getLastEmergencyPause(
      txDetails?: Truffle.TransactionDetails
    ): Promise<[boolean, BN, string]>;

    getLatestAddress(
      _contractName: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<string>;

    getOwnerParameters(
      code: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<[string, string]>;

    getVersionData(
      txDetails?: Truffle.TransactionDetails
    ): Promise<[string[], string[]]>;

    governanceOwner(txDetails?: Truffle.TransactionDetails): Promise<string>;

    initializeGovernanceOwner: {
      (txDetails?: Truffle.TransactionDetails): Promise<
        Truffle.TransactionResponse<AllEvents>
      >;
      call(txDetails?: Truffle.TransactionDetails): Promise<void>;
      sendTransaction(txDetails?: Truffle.TransactionDetails): Promise<string>;
      estimateGas(txDetails?: Truffle.TransactionDetails): Promise<number>;
    };

    isAuthorizedToGovern(
      _toCheck: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<boolean>;

    isInternal(
      _contractAddress: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<boolean>;

    isMember(
      _add: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<boolean>;

    isOwner(
      _address: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<boolean>;

    isPause(txDetails?: Truffle.TransactionDetails): Promise<boolean>;

    isProxy(
      arg0: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<boolean>;

    isUpgradable(
      arg0: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<boolean>;

    masterAddress(txDetails?: Truffle.TransactionDetails): Promise<string>;

    masterInitialized(txDetails?: Truffle.TransactionDetails): Promise<boolean>;

    owner(txDetails?: Truffle.TransactionDetails): Promise<string>;

    pauseTime(txDetails?: Truffle.TransactionDetails): Promise<BN>;

    startEmergencyPause: {
      (txDetails?: Truffle.TransactionDetails): Promise<
        Truffle.TransactionResponse<AllEvents>
      >;
      call(txDetails?: Truffle.TransactionDetails): Promise<void>;
      sendTransaction(txDetails?: Truffle.TransactionDetails): Promise<string>;
      estimateGas(txDetails?: Truffle.TransactionDetails): Promise<number>;
    };

    switchGovernanceAddress: {
      (newGV: string, txDetails?: Truffle.TransactionDetails): Promise<
        Truffle.TransactionResponse<AllEvents>
      >;
      call(
        newGV: string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<void>;
      sendTransaction(
        newGV: string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<string>;
      estimateGas(
        newGV: string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<number>;
    };

    tokenAddress(txDetails?: Truffle.TransactionDetails): Promise<string>;

    updateOwnerParameters: {
      (
        code: string,
        val: string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<Truffle.TransactionResponse<AllEvents>>;
      call(
        code: string,
        val: string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<void>;
      sendTransaction(
        code: string,
        val: string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<string>;
      estimateGas(
        code: string,
        val: string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<number>;
    };

    updatePauseTime: {
      (
        _time: number | BN | string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<Truffle.TransactionResponse<AllEvents>>;
      call(
        _time: number | BN | string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<void>;
      sendTransaction(
        _time: number | BN | string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<string>;
      estimateGas(
        _time: number | BN | string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<number>;
    };

    upgradeMultipleContracts: {
      (
        _contractsName: string[],
        _contractsAddress: string[],
        txDetails?: Truffle.TransactionDetails
      ): Promise<Truffle.TransactionResponse<AllEvents>>;
      call(
        _contractsName: string[],
        _contractsAddress: string[],
        txDetails?: Truffle.TransactionDetails
      ): Promise<void>;
      sendTransaction(
        _contractsName: string[],
        _contractsAddress: string[],
        txDetails?: Truffle.TransactionDetails
      ): Promise<string>;
      estimateGas(
        _contractsName: string[],
        _contractsAddress: string[],
        txDetails?: Truffle.TransactionDetails
      ): Promise<number>;
    };

    upgradeMultipleImplementations: {
      (
        _contractNames: string[],
        _contractAddresses: string[],
        txDetails?: Truffle.TransactionDetails
      ): Promise<Truffle.TransactionResponse<AllEvents>>;
      call(
        _contractNames: string[],
        _contractAddresses: string[],
        txDetails?: Truffle.TransactionDetails
      ): Promise<void>;
      sendTransaction(
        _contractNames: string[],
        _contractAddresses: string[],
        txDetails?: Truffle.TransactionDetails
      ): Promise<string>;
      estimateGas(
        _contractNames: string[],
        _contractAddresses: string[],
        txDetails?: Truffle.TransactionDetails
      ): Promise<number>;
    };
  };

  getPastEvents(event: string): Promise<EventData[]>;
  getPastEvents(
    event: string,
    options: PastEventOptions,
    callback: (error: Error, event: EventData) => void
  ): Promise<EventData[]>;
  getPastEvents(event: string, options: PastEventOptions): Promise<EventData[]>;
  getPastEvents(
    event: string,
    callback: (error: Error, event: EventData) => void
  ): Promise<EventData[]>;
}
