import { assert } from "./modules";

/** Read a stream of bits, emitting as bytes */
function* bitsToBytes(bits: Generator<1 | 0>): Generator<number> {
    let nextByte = 0;
    let bitIndex = 7;
    for(const bit of bits) {
        assert(bit === 0 || bit === 1);
        if(bit) {
            nextByte |= 1<<bitIndex;
        }
        if(bitIndex === 0) {
            yield nextByte;
            nextByte = 0;
            bitIndex = 7;
        } else {
            bitIndex--;
        }
    }
    yield nextByte;
}
