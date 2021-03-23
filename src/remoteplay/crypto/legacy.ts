import crypto from "crypto";
import { CryptoCodec } from "../../socket/crypto-codec";

import { RemotePlayVersion } from "../model";
import { ICryptoStrategy } from "./model";
import { generateIv } from "./modern";

const KEY_SIZE = 16;
const PADDING_BYTES = 480;
const AES_KEY = "3f1cc4b6dcbb3ecc50baedef9734c7c9";

function generateSeed(pin: number) {
    /* eslint-disable no-bitwise */
    const seed = Buffer.from(AES_KEY, "hex");

    seed[0] ^= (pin >> 0x18) & 0xff;
    seed[1] ^= (pin >> 0x10) & 0xff;
    seed[2] ^= (pin >> 0x08) & 0xff;
    seed[3] ^= (pin >> 0x00) & 0xff;

    return seed;
    /* eslint-enable no-bitwise */
}

const ECHO_B = [
    0xe1, 0xec, 0x9c, 0x3a, 0xdd, 0xbd, 0x08, 0x85,
    0xfc, 0x0e, 0x1d, 0x78, 0x90, 0x32, 0xc0, 0x04,
];

function aeropause(padding: Buffer, offset: number, nonce: Buffer) {
    /* eslint-disable no-bitwise, no-param-reassign */
    for (let i = 0; i < KEY_SIZE; ++i) {
        padding[offset + i] = (nonce[i] - i - 0x29) ^ ECHO_B[i];
    }
    /* eslint-enable no-bitwise, no-param-reassign */
}

export class LegacyCryptoStrategy implements ICryptoStrategy {
    private counter = 0;

    constructor(
        private readonly version: RemotePlayVersion,
        private readonly pin: string,
    ) {}

    public createCodec(nonce: Buffer) {
        const pinNumber = parseInt(this.pin, 10);

        const padding = Buffer.alloc(PADDING_BYTES);
        crypto.randomFillSync(padding);

        const AEROPAUSE_DESTINATION = 0x11c;
        aeropause(padding, AEROPAUSE_DESTINATION, nonce);

        const iv = generateIv(this.version, nonce, this.counter);
        const seed = generateSeed(pinNumber);
        const codec = new CryptoCodec(iv, seed);
        return {
            codec,
            preface: padding,
        };
    }
}