/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import BN from "bn.js";
import { EventData, PastEventOptions } from "web3-eth-contract";

export interface P1MockOldMCRContract
  extends Truffle.Contract<P1MockOldMCRInstance> {
  "new"(meta?: Truffle.TransactionDetails): Promise<P1MockOldMCRInstance>;
}

export interface MCREvent {
  name: "MCREvent";
  args: {
    date: BN;
    blockNumber: BN;
    allCurr: string[];
    allCurrRates: BN[];
    mcrEtherx100: BN;
    mcrPercx100: BN;
    vFull: BN;
    0: BN;
    1: BN;
    2: string[];
    3: BN[];
    4: BN;
    5: BN;
    6: BN;
  };
}

type AllEvents = MCREvent;

export interface P1MockOldMCRInstance extends Truffle.ContractInstance {
  _calVtpAndMCRtp(
    poolBalance: number | BN | string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<[BN, BN]>;

  calVtpAndMCRtp(txDetails?: Truffle.TransactionDetails): Promise<[BN, BN]>;

  calculateStepTokenPrice(
    curr: string,
    mcrtp: number | BN | string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<BN>;

  calculateTokenPrice(
    curr: string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<BN>;

  calculateVtpAndMCRtp(
    poolBalance: number | BN | string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<[BN, BN]>;

  changeDependentContractAddress: {
    (txDetails?: Truffle.TransactionDetails): Promise<
      Truffle.TransactionResponse<AllEvents>
    >;
    call(txDetails?: Truffle.TransactionDetails): Promise<void>;
    sendTransaction(txDetails?: Truffle.TransactionDetails): Promise<string>;
    estimateGas(txDetails?: Truffle.TransactionDetails): Promise<number>;
  };

  changeMasterAddress: {
    (_masterAddress: string, txDetails?: Truffle.TransactionDetails): Promise<
      Truffle.TransactionResponse<AllEvents>
    >;
    call(
      _masterAddress: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<void>;
    sendTransaction(
      _masterAddress: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<string>;
    estimateGas(
      _masterAddress: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<number>;
  };

  dynamicMincapIncrementx100(
    txDetails?: Truffle.TransactionDetails
  ): Promise<BN>;

  dynamicMincapThresholdx100(
    txDetails?: Truffle.TransactionDetails
  ): Promise<BN>;

  getAllSumAssurance(txDetails?: Truffle.TransactionDetails): Promise<BN>;

  getMaxSellTokens(txDetails?: Truffle.TransactionDetails): Promise<BN>;

  ms(txDetails?: Truffle.TransactionDetails): Promise<string>;

  nxMasterAddress(txDetails?: Truffle.TransactionDetails): Promise<string>;

  variableMincap(txDetails?: Truffle.TransactionDetails): Promise<BN>;

  methods: {
    _calVtpAndMCRtp(
      poolBalance: number | BN | string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<[BN, BN]>;

    calVtpAndMCRtp(txDetails?: Truffle.TransactionDetails): Promise<[BN, BN]>;

    calculateStepTokenPrice(
      curr: string,
      mcrtp: number | BN | string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<BN>;

    calculateTokenPrice(
      curr: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<BN>;

    calculateVtpAndMCRtp(
      poolBalance: number | BN | string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<[BN, BN]>;

    changeDependentContractAddress: {
      (txDetails?: Truffle.TransactionDetails): Promise<
        Truffle.TransactionResponse<AllEvents>
      >;
      call(txDetails?: Truffle.TransactionDetails): Promise<void>;
      sendTransaction(txDetails?: Truffle.TransactionDetails): Promise<string>;
      estimateGas(txDetails?: Truffle.TransactionDetails): Promise<number>;
    };

    changeMasterAddress: {
      (_masterAddress: string, txDetails?: Truffle.TransactionDetails): Promise<
        Truffle.TransactionResponse<AllEvents>
      >;
      call(
        _masterAddress: string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<void>;
      sendTransaction(
        _masterAddress: string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<string>;
      estimateGas(
        _masterAddress: string,
        txDetails?: Truffle.TransactionDetails
      ): Promise<number>;
    };

    dynamicMincapIncrementx100(
      txDetails?: Truffle.TransactionDetails
    ): Promise<BN>;

    dynamicMincapThresholdx100(
      txDetails?: Truffle.TransactionDetails
    ): Promise<BN>;

    getAllSumAssurance(txDetails?: Truffle.TransactionDetails): Promise<BN>;

    getMaxSellTokens(txDetails?: Truffle.TransactionDetails): Promise<BN>;

    ms(txDetails?: Truffle.TransactionDetails): Promise<string>;

    nxMasterAddress(txDetails?: Truffle.TransactionDetails): Promise<string>;

    variableMincap(txDetails?: Truffle.TransactionDetails): Promise<BN>;
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
