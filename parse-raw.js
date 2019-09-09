const fs = require('fs');
const assert = require('assert');

/**
 * Parse a raw file exported from Audacity.
 * Assumes raw file contains signed 8bit PCM, 48000Hz
 */

function main() {
    const [, , inputPath, outputPath] = process.argv;
    const audioSampleRateHz = 48000;
    const poEncodingSampleRateHz = 32000;
    const samplesPerBit = audioSampleRateHz / poEncodingSampleRateHz;
    const maxUncertainty = 1/3;

    const output = fs.openSync(outputPath, 'w');
    const input = fs.openSync(inputPath);
    function* a() {
        let skip = 0;
        for(const [side, crossingTimestamp, crossingDelta] of generateZeroCrossings(generateNumbers(input))) {
            const div = crossingDelta / samplesPerBit;
            const numberOfBits = Math.round(div);
            const uncertainty = (numberOfBits - div) / samplesPerBit;
            if(Math.abs(uncertainty) > maxUncertainty) 
                console.log(uncertainty);
            const bit = side === 1 ? 0 : 1;
            if(skip) {
                console.dir({side, crossingTimestamp, crossingDelta});
                skip--;
                continue;
            }
            for(let i = 0; i < numberOfBits; i++) {
                yield bit;
            }
        }
    }
    for(const byte of bitsToBytes(a())) {
        fs.writeSync(output, Buffer.from([byte]));
    }
    fs.closeSync(input);
    fs.closeSync(output);
}

function* generateNumbers(input) {
    const inputBuffer = Buffer.alloc(100);
    // const outputBuffer = new Buffer(100);
    while(true) {
        const length = fs.readSync(input, inputBuffer, 0, 100, null);
        if(length === 0) break;

        for(const number of new Int8Array(inputBuffer.slice(0, length))) {
            yield number;
        }
    }
}

function* bitsToBytes(bits) {
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

function* generateZeroCrossings(generator) {
    const threshold = 10;
    let i = -1;
    let negativeIndex = 0;
    let negativeValue = 0;
    let positiveIndex = 0;
    let positiveValue = 0;
    let lastSeenAboveAxis = true;
    let lastCrossing = 0;
    let f = 2;
    function computeCrossing({
        beforeIndex, beforeValue, afterIndex, afterValue
    }) {
        // HACK if these are the first crossings
        if(beforeIndex === 0) return afterIndex - 0.5;
        const percentageOfTimeBeforeCrossing = beforeValue / (beforeValue - afterValue);
        const crossingTime = beforeIndex + percentageOfTimeBeforeCrossing * (afterIndex - beforeIndex);
        // if(Math.abs(beforeIndex - afterIndex) > 2) {
        // if(f) {
        //     f--;
        //     console.dir({
        //         beforeIndex, beforeValue,
        //         afterIndex, afterValue,
        //         percentageOfTimeBeforeCrossing,
        //         crossingTime
        //     });
        // }
        return crossingTime;
    }
    for(const number of generator) {
        i++;
        // Skip values too close to 0
        if(Math.abs(number) < threshold) continue;
        if(number < 0) {
            // is negative number
            negativeIndex = i;
            negativeValue = number;
            // if is transition to negative
            if(lastSeenAboveAxis) {
                lastSeenAboveAxis = false;
                const crossingTime = computeCrossing({
                    beforeIndex: positiveIndex,
                    beforeValue: positiveValue,
                    afterIndex: negativeIndex,
                    afterValue: negativeValue
                });
                yield [-1, crossingTime, lastCrossing === 0 ? 0 : crossingTime - lastCrossing];
                lastCrossing = crossingTime;
            }
        } else {
            // is positive number
            positiveIndex = i;
            positiveValue = number;
            // if is transition to positive
            if(!lastSeenAboveAxis) {
                lastSeenAboveAxis = true;
                const crossingTime = computeCrossing({
                    beforeIndex: negativeIndex,
                    beforeValue: negativeValue,
                    afterIndex: positiveIndex,
                    afterValue: positiveValue
                });
                yield [1, crossingTime, lastCrossing === 0 ? 0 : crossingTime - lastCrossing];
                lastCrossing = crossingTime;
            }
        }
    }
}

main();
