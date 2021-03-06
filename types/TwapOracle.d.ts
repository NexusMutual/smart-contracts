/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import BN from "bn.js";
import { EventData, PastEventOptions } from "web3-eth-contract";

export interface TwapOracleContract
  extends Truffle.Contract<TwapOracleInstance> {
  "new"(
    _factory: string,
    meta?: Truffle.TransactionDetails
  ): Promise<TwapOracleInstance>;
}

export interface Updated {
  name: "Updated";
  args: {
    pair: string;
    timestamp: BN;
    price0Cumulative: BN;
    price1Cumulative: BN;
    0: string;
    1: BN;
    2: BN;
    3: BN;
  };
}

type AllEvents = Updated;

export interface TwapOracleInstance extends Truffle.ContractInstance {
  buckets(
    arg0: string,
    arg1: number | BN | string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<[BN, BN, BN]>;

  canUpdate(
    pair: string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<boolean>;

  consult(
    tokenIn: string,
    amountIn: number | BN | string,
    tokenOut: string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<BN>;

  currentBucketIndex(txDetails?: Truffle.TransactionDetails): Promise<BN>;

  factory(txDetails?: Truffle.TransactionDetails): Promise<string>;

  pairFor(
    tokenA: string,
    tokenB: string,
    txDetails?: Truffle.TransactionDetails
  ): Promise<string>;

  periodSize(txDetails?: Truffle.TransactionDetails): Promise<BN>;

  periodsPerWindow(txDetails?: Truffle.TransactionDetails): Promise<BN>;

  update: {
    (pairs: string[], txDetails?: Truffle.TransactionDetails): Promise<
      Truffle.TransactionResponse<AllEvents>
    >;
    call(
      pairs: string[],
      txDetails?: Truffle.TransactionDetails
    ): Promise<void>;
    sendTransaction(
      pairs: string[],
      txDetails?: Truffle.TransactionDetails
    ): Promise<string>;
    estimateGas(
      pairs: string[],
      txDetails?: Truffle.TransactionDetails
    ): Promise<number>;
  };

  windowSize(txDetails?: Truffle.TransactionDetails): Promise<BN>;

  methods: {
    buckets(
      arg0: string,
      arg1: number | BN | string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<[BN, BN, BN]>;

    canUpdate(
      pair: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<boolean>;

    consult(
      tokenIn: string,
      amountIn: number | BN | string,
      tokenOut: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<BN>;

    currentBucketIndex(txDetails?: Truffle.TransactionDetails): Promise<BN>;

    factory(txDetails?: Truffle.TransactionDetails): Promise<string>;

    pairFor(
      tokenA: string,
      tokenB: string,
      txDetails?: Truffle.TransactionDetails
    ): Promise<string>;

    periodSize(txDetails?: Truffle.TransactionDetails): Promise<BN>;

    periodsPerWindow(txDetails?: Truffle.TransactionDetails): Promise<BN>;

    update: {
      (pairs: string[], txDetails?: Truffle.TransactionDetails): Promise<
        Truffle.TransactionResponse<AllEvents>
      >;
      call(
        pairs: string[],
        txDetails?: Truffle.TransactionDetails
      ): Promise<void>;
      sendTransaction(
        pairs: string[],
        txDetails?: Truffle.TransactionDetails
      ): Promise<string>;
      estimateGas(
        pairs: string[],
        txDetails?: Truffle.TransactionDetails
      ): Promise<number>;
    };

    windowSize(txDetails?: Truffle.TransactionDetails): Promise<BN>;
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
