#!/usr/bin/env ts-node-to
import fs from 'fs';
import assert from 'assert';
import Path from 'path';
import __yargs from 'yargs';
import { parseDpskHandler } from './src/parse-dpsk';
import { dataPath, generateNumbers } from './src/core';
import { noReturn, arraysEqual, concatGenerators, arrayToGenerator, pullXValuesFromGenerator } from './src/generator-utils';
const yargs = require('yargs') as typeof __yargs;

const argv = yargs.command('raw-to-bits', 'Parse raw to bits', {
    builder(yargs) {
        return yargs.options({
            sampleRate: {
                alias: 'r',
                type: 'number',
                demand: true
            },
            name: {
                type: 'string',
                demand: true
            },
        });
    },
    handler(argv) {
        main(argv as any);
    }
}).command('dump-slice', 'extract a slice of backup as CSV', {
    builder(yargs) {
        return yargs.options({
            sampleRate: {
                alias: 'r',
                type: 'number',
                demand: true
            },
            name: {
                type: 'string',
                demand: true
            },
            start: {
                type: 'number',
                demand: true
            },
            end: {
                type: 'number',
                demand: true
            }
        });
    },
    handler(argv) {
        const {name, sampleRate, start, end} = argv as any as {sampleRate: number, name: string, output: string, start: number, end: number};
        const countBytes = end - start;
        function readSide(side: 'left' | 'right') {
            const sideRaw = fs.openSync(dataPath(name, `${side}.${sampleRate}.s8`), 'r');
            const b = Buffer.alloc(countBytes);
            fs.readSync(sideRaw, b, 0, countBytes, start);
            fs.closeSync(sideRaw);
            return new Int8Array(b);
        }
        const left = readSide('left');
        const right = readSide('right');
        let acc = '';
        for(let i = 0; i < countBytes; i++) {
            acc += `${left[i]}\t${right[i]}\n`;
        }
        fs.writeFileSync(dataPath(name, `slice.${start}.${end}.tsv`), acc);
    }

}).command('parse-dpsk', '', {
    builder(yargs) {
        return yargs.options({
            name: {type: 'string', demand: true},
            sampleRate: {type: 'number', demand: true}
        });
    },
    handler(args) {
        parseDpskHandler(args as any as {name: string, sampleRate: string});
    }
}).command('$0'/*'parse-dpsk-via-bits'*/, '', {
    builder(yargs) {
        return yargs.options({
            name: {type: 'string', demand: true},
            sampleRate: {type: 'number', default: 96000}
        });
    },
    handler(args) {
        parsePhasesViaBits(args as unknown as {name: string, sampleRate: number});
    }
}).parse();

/**
 * Parse a raw file exported from Audacity.
 * Assumes raw file contains signed 8bit PCM, 48000Hz
 */
function main(opts: {name: string, sampleRate: number}) {
    const {name, sampleRate} = opts;
    const side = 'left';

    console.log(`Opening input and output files`);
    const output = fs.openSync(dataPath(name, `${ side }.${ sampleRate }.bits`), 'w');
    const input = fs.openSync(dataPath(name, `${ side }.${ sampleRate }.s8`), 'r');

    const bitStream = bitSpitter({input: generateNumbers(input), sampleRate});
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

/**
 * Parse a raw file exported from Audacity.
 * Assumes raw file contains signed 8bit PCM, 48000Hz
 */
function parsePhasesViaBits(opts: {name: string, sampleRate: number}) {
    const {name, sampleRate} = opts;
    doIt('left');
    doIt('right');
    function doIt(side: 'left' | 'right') {
        console.log(`Opening input and output files`);
        const output = fs.openSync(dataPath(name, `${ side }.${ sampleRate }.phases`), 'w');
        const input = fs.openSync(dataPath(name, `${ side }.${ sampleRate }.s8`), 'r');

        const bitStream = bitSpitter({input: generateNumbers(input), sampleRate});
        const phaseStream = bitsToPhases({bitStream});
        
        let lineLength = 0;
        for(const phase of phaseStream) {
            fs.writeSync(output, `${phase}`);
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
}

function* bitsToPhases(opts: {bitStream: Generator<Bit>}) {
    const {bitStream} = opts;
    const bits = new Array<Bit>();
    // detect the first 11
    for(const bit of noReturn(bitStream)) {
        bits.push(bit);
        if(arraysEqual(bits.slice(-2), [1, 1])) {
            break;
        }
    }

    const rest = noReturn(concatGenerators(arrayToGenerator([1]), bitStream));
    while(true) {
        const bits = pullXValuesFromGenerator(rest, 2);
        pullXValuesFromGenerator(rest, 2);
        if(bits.length < 2) break;
        const b = ([
            [[1, 1], 'A'],
            [[1, 0], 'B'],
            [[0, 0], 'C'],
            [[0, 1], 'D']
        ] as const).find(([signature, phase]) => arraysEqual(bits, signature));
        if(!b) console.dir({Error: true, bits, b});
        yield b ? b[1] : '-';
    }
}

function bitSpitter(opts: {input: Generator<number>, sampleRate: number}) {
    const {sampleRate, input} = opts;
    const poEncodingSampleRateHz = 7800 * 4;
    const samplesPerBit = sampleRate / poEncodingSampleRateHz;
    const maxUncertainty = 1/4;
    console.log(`Creating bitstream`);
    const bitStream = zeroCrossingsToBits({
        zeroCrossings: generateZeroCrossings(
            input
        ),
        maxUncertainty,
        samplesPerBit
    });
    return bitStream;
}

export type Bit = 0 | 1;

function* zeroCrossingsToBits(opts: {
    zeroCrossings: Generator<ZeroCrossing>,
    maxUncertainty: number,
    samplesPerBit: number
}): Generator<Bit> {
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
