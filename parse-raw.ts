#!/usr/bin/env ts-node-to
import fs from 'fs';
import assert from 'assert';
import __yargs from 'yargs';
const yargs = require('yargs') as typeof __yargs;

const argv = yargs.command('$0', 'Parse raw to bits', {
    builder(yargs) {
        return yargs.options({
            sampleRate: {
                alias: 'r',
                type: 'number',
                demand: true
            },
            inputPath: {
                alias: 'input',
                type: 'string',
                demand: true
            },
            outputPath: {
                alias: 'output',
                type: 'string',
                demand: true
            }
        });
    },
    handler(argv) {
        main(argv as any);
    }
}).parse();

/**
 * Parse a raw file exported from Audacity.
 * Assumes raw file contains signed 8bit PCM, 48000Hz
 */

function main(opts: {inputPath: string, outputPath: string, sampleRate: number}) {
    const {inputPath, outputPath, sampleRate: audioSampleRateHz} = opts;
    const poEncodingSampleRateHz = 32000;
    const samplesPerBit = audioSampleRateHz / poEncodingSampleRateHz;
    const maxUncertainty = 1/3;

    console.log(`Opening input and output files`);
    const output = fs.openSync(outputPath, 'w');
    const input = fs.openSync(inputPath, 'r');

    console.log(`Creating bitstream`);
    const bitStream = zeroCrossingsToBits({
        zeroCrossings: generateZeroCrossings(
            generateNumbers(input)
        ),
        maxUncertainty,
        samplesPerBit
    });
    console.log(`Iterating bitstream`);
    let lineLength = 0;
    for(const bit of bitStream) {
        fs.writeSync(output, `${bit}`);
        lineLength++;
        if(lineLength === 80) {
            fs.writeSync(output, '\n');
            lineLength = 0;
        }
    }
    console.log(`Closing files`);
    fs.closeSync(input);
    fs.closeSync(output);
}

function* zeroCrossingsToBits(opts: {
    zeroCrossings: Generator<ZeroCrossing>,
    maxUncertainty: number,
    samplesPerBit: number
}): Generator<0 | 1> {
    const {maxUncertainty, samplesPerBit, zeroCrossings} = opts;
    let skip = 0;
    for(const {side, timestamp, delta} of zeroCrossings) {
        const numberOfBitsFractional = delta / samplesPerBit;
        const numberOfBits = Math.round(numberOfBitsFractional);
        // Uncertainty of 0.5 means it's smack in the middle, between two possible counts of bits.
        // (For example, the delta time is halfway between the time it takes for 2 bits and for 3 bits)
        // That is bad because it means we don't have any idea what number of bits was being encoded.
        // Or it means our assumptions about the bit-rate or encoding format are totally wrong.
        const uncertainty = (numberOfBits - numberOfBitsFractional) / samplesPerBit;
        if(Math.abs(uncertainty) > maxUncertainty)
            console.log('High uncertainty: ' + uncertainty);
        const bit = side === 1 ? 0 : 1;
        if(skip) {
            console.dir({side, crossingTimestamp: timestamp, crossingDelta: delta});
            skip--;
            continue;
        }
        for(let i = 0; i < numberOfBits; i++) {
            yield bit;
        }
    }
}

/** emit an input FD one byte at a time */
function* generateNumbers(input: number): Generator<number> {
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

interface ZeroCrossing {
    side: 1 | -1;
    timestamp: number;
    delta: number;
}
function* generateZeroCrossings(generator: Generator<number, void, unknown>): Generator<ZeroCrossing, void, unknown> {
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
    }: {beforeIndex: number, beforeValue: number, afterIndex: number, afterValue: number}) {
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
                yield {side: -1, timestamp: crossingTime, delta: lastCrossing === 0 ? 0 : crossingTime - lastCrossing};
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
                yield {side: 1, timestamp: crossingTime, delta: lastCrossing === 0 ? 0 : crossingTime - lastCrossing};
                lastCrossing = crossingTime;
            }
        }
    }
}
